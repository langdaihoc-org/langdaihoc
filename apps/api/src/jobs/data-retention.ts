import { lt, and, inArray, sql, isNotNull, eq } from 'drizzle-orm';
import type { Database, DbConn } from '@langdaihoc/database';
import {
  notifications,
  auditLogs,
  orders,
  checkoutIdempotencyKeys,
  paymentProofs,
  complaints,
  reviews,
  posts,
  carts,
  cartItems,
  siteFeedback,
} from '@langdaihoc/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { scheduleDailyAtMidnight } from './daily-schedule.js';
import { removeStorageObjects } from '../lib/storage.js';
import { refreshUnreadForUsers } from '../services/counters.js';

/** Thông báo inbox — 7 ngày */
const NOTIFICATIONS_DAYS = 7;
/** Idempotency key checkout — 14 ngày (tránh retry muộn tạo đơn trùng) */
const IDEMPOTENCY_DAYS = 14;
/** Audit log — 30 ngày */
const AUDIT_DAYS = 30;
/** Đơn đã kết thúc (completed/cancelled/rejected) — 7 ngày */
const SETTLED_ORDER_DAYS = 7;
/** Bài đăng feed — 7 ngày (theo createdAt) */
const POSTS_DAYS = 7;
/** Đánh giá — 90 ngày; điểm trung bình vẫn giữ trên sellers.rating_sum/rating_count */
const REVIEWS_DAYS = 90;
/** Hồ sơ khiếu nại đã đóng — 30 ngày kể từ lúc đóng */
const CLOSED_COMPLAINT_DAYS = 30;
/** Giỏ hàng bỏ quên — 30 ngày */
const ABANDONED_CART_DAYS = 30;
/** Góp ý đã xử lý — 90 ngày */
const FEEDBACK_DAYS = 90;
/** Khoảng chờ trước khi rollup đụng vào một đơn vừa hoàn thành (phút) */
const ROLLUP_GRACE_MINUTES = 60;
/** pg_advisory_xact_lock key — an toàn với connection pool (nhả khi commit/rollback). */
const RETENTION_LOCK_KEY = 7_714_201;

const SETTLED_STATUSES = ['completed', 'cancelled', 'rejected'] as const;
const CHUNK = 200;

function cutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function cutoffIso(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

/** @deprecated — giữ để compat smoke/import cũ */
export function retentionCutoff(days = SETTLED_ORDER_DAYS) {
  return cutoff(days);
}

function collectUrls(...parts: Array<string | string[] | null | undefined>): string[] {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (Array.isArray(part)) {
      for (const u of part) {
        if (typeof u === 'string' && u.trim()) out.push(u.trim());
      }
    } else if (typeof part === 'string' && part.trim()) {
      out.push(part.trim());
    }
  }
  return out;
}

async function rollupUnaccountedOrders(db: DbConn) {
  await db.execute(sql`
    with picked as (
      select id, seller_id, buyer_id, total, coalesce(completed_at, updated_at) as at
      from orders
      where status = 'completed'
        and stats_recorded_at is null
        and updated_at < ${cutoffIso(ROLLUP_GRACE_MINUTES)}::timestamptz
      for update
    ), day_agg as (
      select seller_id, (at at time zone 'Asia/Ho_Chi_Minh')::date as day,
             count(*)::int as cnt, sum(total) as revenue
      from picked group by 1, 2
    ), ins_day as (
      insert into seller_daily_stats (seller_id, day, completed_orders, revenue, updated_at)
      select seller_id, day, cnt, revenue, now() from day_agg
      on conflict (seller_id, day) do update set
        completed_orders = seller_daily_stats.completed_orders + excluded.completed_orders,
        revenue = seller_daily_stats.revenue + excluded.revenue,
        updated_at = now()
    ), seller_agg as (
      select seller_id, count(*)::int as cnt, sum(total) as revenue from picked group by 1
    ), ins_seller as (
      insert into seller_counters (seller_id, lifetime_orders, lifetime_revenue, latest_change_at, version, updated_at)
      select seller_id, cnt, revenue, now(), 1, now() from seller_agg
      on conflict (seller_id) do update set
        lifetime_orders = seller_counters.lifetime_orders + excluded.lifetime_orders,
        lifetime_revenue = seller_counters.lifetime_revenue + excluded.lifetime_revenue,
        latest_change_at = now(),
        version = seller_counters.version + 1,
        updated_at = now()
    ), buyer_agg as (
      select buyer_id, count(*)::int as cnt from picked group by 1
    ), ins_buyer as (
      insert into buyer_counters (user_id, lifetime_completed, latest_change_at, version, updated_at)
      select buyer_id, cnt, now(), 1, now() from buyer_agg
      on conflict (user_id) do update set
        lifetime_completed = buyer_counters.lifetime_completed + excluded.lifetime_completed,
        latest_change_at = now(),
        version = buyer_counters.version + 1,
        updated_at = now()
    )
    update orders set stats_recorded_at = now()
    where id in (select id from picked)
  `);
}

export type RetentionDbResult = {
  notifications: number;
  idempotencyKeys: number;
  auditLogs: number;
  orders: number;
  complaints: number;
  reviews: number;
  posts: number;
  cartItems: number;
  feedback: number;
  notifUserIds: string[];
  proofUrls: string[];
  complaintEvidenceUrls: string[];
  postUrls: string[];
};

/**
 * Phần DB thuần — không gọi storage HTTP.
 * URL file được thu thập để xóa sau khi transaction commit.
 */
export async function runDataRetentionDb(db: DbConn): Promise<RetentionDbResult> {
  const staleNotifs = await db
    .select({ id: notifications.id, userId: notifications.userId })
    .from(notifications)
    .where(lt(notifications.createdAt, cutoff(NOTIFICATIONS_DAYS)));
  const notifUserIds = [...new Set(staleNotifs.map((n) => n.userId))];
  if (staleNotifs.length) {
    await db.delete(notifications).where(
      inArray(
        notifications.id,
        staleNotifs.map((n) => n.id),
      ),
    );
  }
  if (notifUserIds.length) {
    await refreshUnreadForUsers(db, notifUserIds);
  }

  const deletedIdempotency = await db
    .delete(checkoutIdempotencyKeys)
    .where(lt(checkoutIdempotencyKeys.createdAt, cutoff(IDEMPOTENCY_DAYS)))
    .returning({ id: checkoutIdempotencyKeys.id });

  const deletedAudit = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, cutoff(AUDIT_DAYS)))
    .returning({ id: auditLogs.id });

  let deletedOrders = 0;
  let deletedComplaints = 0;
  let deletedReviews = 0;
  let deletedPosts = 0;
  let deletedCartItems = 0;
  const proofUrls: string[] = [];
  const complaintEvidenceUrls: string[] = [];
  const postUrls: string[] = [];

  await rollupUnaccountedOrders(db);

  const settled = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        inArray(orders.status, [...SETTLED_STATUSES]),
        lt(orders.updatedAt, cutoff(SETTLED_ORDER_DAYS)),
      ),
    );

  if (settled.length > 0) {
    const orderIds = settled.map((r) => r.id);
    for (let i = 0; i < orderIds.length; i += CHUNK) {
      const chunk = orderIds.slice(i, i + CHUNK);
      const proofRows = await db
        .select({ imageUrl: paymentProofs.imageUrl })
        .from(paymentProofs)
        .where(inArray(paymentProofs.orderId, chunk));
      proofUrls.push(...collectUrls(...proofRows.map((r) => r.imageUrl)));

      const removedOrders = await db
        .delete(orders)
        .where(inArray(orders.id, chunk))
        .returning({ id: orders.id });
      deletedOrders += removedOrders.length;
    }
  }

  const staleReviews = await db
    .delete(reviews)
    .where(lt(reviews.createdAt, cutoff(REVIEWS_DAYS)))
    .returning({ id: reviews.id });
  deletedReviews = staleReviews.length;

  const closedComplaints = await db
    .select({ id: complaints.id, evidenceUrls: complaints.evidenceUrls })
    .from(complaints)
    .where(
      and(
        inArray(complaints.status, ['resolved', 'rejected']),
        isNotNull(complaints.closedAt),
        lt(complaints.closedAt, cutoff(CLOSED_COMPLAINT_DAYS)),
      ),
    );

  for (let i = 0; i < closedComplaints.length; i += CHUNK) {
    const chunk = closedComplaints.slice(i, i + CHUNK);
    complaintEvidenceUrls.push(...chunk.flatMap((r) => collectUrls(r.evidenceUrls)));
    const removed = await db
      .delete(complaints)
      .where(inArray(complaints.id, chunk.map((r) => r.id)))
      .returning({ id: complaints.id });
    deletedComplaints += removed.length;
  }

  const stalePosts = await db
    .select({
      id: posts.id,
      imageUrl: posts.imageUrl,
      imageUrls: posts.imageUrls,
    })
    .from(posts)
    .where(lt(posts.createdAt, cutoff(POSTS_DAYS)));

  if (stalePosts.length > 0) {
    for (let i = 0; i < stalePosts.length; i += CHUNK) {
      const chunk = stalePosts.slice(i, i + CHUNK);
      postUrls.push(...chunk.flatMap((p) => collectUrls(p.imageUrl, p.imageUrls)));
      const removed = await db
        .delete(posts)
        .where(inArray(posts.id, chunk.map((p) => p.id)))
        .returning({ id: posts.id });
      deletedPosts += removed.length;
    }
  }

  const staleCarts = await db
    .select({ id: carts.id })
    .from(carts)
    .where(lt(carts.updatedAt, cutoff(ABANDONED_CART_DAYS)));
  for (let i = 0; i < staleCarts.length; i += CHUNK) {
    const chunk = staleCarts.slice(i, i + CHUNK).map((c) => c.id);
    const removed = await db
      .delete(cartItems)
      .where(inArray(cartItems.cartId, chunk))
      .returning({ id: cartItems.id });
    deletedCartItems += removed.length;
    if (removed.length) {
      await db.update(carts).set({ sellerId: null }).where(inArray(carts.id, chunk));
    }
  }

  const removedFeedback = await db
    .delete(siteFeedback)
    .where(and(eq(siteFeedback.status, 'done'), lt(siteFeedback.updatedAt, cutoff(FEEDBACK_DAYS))))
    .returning({ id: siteFeedback.id });

  return {
    notifications: staleNotifs.length,
    idempotencyKeys: deletedIdempotency.length,
    auditLogs: deletedAudit.length,
    orders: deletedOrders,
    complaints: deletedComplaints,
    reviews: deletedReviews,
    posts: deletedPosts,
    cartItems: deletedCartItems,
    feedback: removedFeedback.length,
    notifUserIds,
    proofUrls,
    complaintEvidenceUrls,
    postUrls,
  };
}

/** @deprecated — dùng scheduleDataRetention; giữ để smoke import cũ. */
export async function runDataRetention(db: DbConn, supabase?: SupabaseClient) {
  const dbResult = await runDataRetentionDb(db);
  let paymentProofFiles = 0;
  let complaintEvidenceFiles = 0;
  let postFiles = 0;
  if (supabase) {
    if (dbResult.proofUrls.length) {
      paymentProofFiles = await removeStorageObjects(supabase, dbResult.proofUrls);
    }
    if (dbResult.complaintEvidenceUrls.length) {
      complaintEvidenceFiles = await removeStorageObjects(supabase, dbResult.complaintEvidenceUrls);
    }
    if (dbResult.postUrls.length) {
      postFiles = await removeStorageObjects(supabase, dbResult.postUrls);
    }
  }
  const { notifUserIds: _, proofUrls: __, complaintEvidenceUrls: ___, postUrls: ____, ...counts } =
    dbResult;
  return {
    ...counts,
    paymentProofFiles,
    complaintEvidenceFiles,
    postFiles,
  };
}

export function scheduleDataRetention(db: Database, supabase?: SupabaseClient) {
  const run = async () => {
    try {
      // DB trong txn ngắn + advisory lock; storage HTTP sau commit để không giữ lock.
      const dbResult = await db.transaction(async (tx) => {
        const locked = await tryRetentionXactLock(tx);
        if (!locked) return null;
        return runDataRetentionDb(tx);
      });
      if (dbResult == null) {
        console.log('[retention] skipped — another instance holds the advisory lock');
        return;
      }

      let paymentProofFiles = 0;
      let complaintEvidenceFiles = 0;
      let postFiles = 0;
      if (supabase) {
        if (dbResult.proofUrls.length) {
          paymentProofFiles = await removeStorageObjects(supabase, dbResult.proofUrls);
        }
        if (dbResult.complaintEvidenceUrls.length) {
          complaintEvidenceFiles = await removeStorageObjects(
            supabase,
            dbResult.complaintEvidenceUrls,
          );
        }
        if (dbResult.postUrls.length) {
          postFiles = await removeStorageObjects(supabase, dbResult.postUrls);
        }
      }

      const {
        notifUserIds: _n,
        proofUrls: _p,
        complaintEvidenceUrls: _c,
        postUrls: _u,
        ...counts
      } = dbResult;
      console.log(
        '[retention]',
        JSON.stringify({ ...counts, paymentProofFiles, complaintEvidenceFiles, postFiles }),
      );
    } catch (err) {
      console.error('[retention] failed', err instanceof Error ? err.message : err);
    }
  };

  void run();
  return scheduleDailyAtMidnight('retention', run);
}

async function tryRetentionXactLock(db: DbConn): Promise<boolean> {
  const rows = await db.execute<{ pg_try_advisory_xact_lock: boolean }>(
    sql`select pg_try_advisory_xact_lock(${RETENTION_LOCK_KEY}) as pg_try_advisory_xact_lock`,
  );
  const list = Array.isArray(rows) ? rows : (rows as { rows?: { pg_try_advisory_xact_lock: boolean }[] }).rows;
  const first = list?.[0] as { pg_try_advisory_xact_lock?: boolean } | undefined;
  return Boolean(first?.pg_try_advisory_xact_lock);
}
