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
/** pg_advisory_xact_lock key — an toàn với connection pool (nhả khi commit/rollback). */
const RETENTION_LOCK_KEY = 7_714_201;

const SETTLED_STATUSES = ['completed', 'cancelled', 'rejected'] as const;
const CHUNK = 200;

function cutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
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

/**
 * Cộng nốt các đơn completed chưa từng được ghi nhận vào seller_daily_stats
 * (đơn phát sinh trước khi có counter, hoặc lỡ sót) rồi đánh dấu để không cộng lần hai.
 * Chạy trước bước xóa đơn, trong cùng transaction.
 */
async function rollupUnaccountedOrders(db: DbConn) {
  await db.execute(sql`
    with picked as (
      select id, seller_id, buyer_id, total, coalesce(completed_at, updated_at) as at
      from orders
      where status = 'completed' and stats_recorded_at is null
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

/**
 * Purge theo lịch:
 * - Thông báo / idempotency / audit (như cũ)
 * - Rollup doanh thu còn sót → seller_daily_stats, rồi xóa đơn settled >7 ngày
 *   (items / laundry / ship_proxy / status history / payment_proofs cascade;
 *    reviews & complaints chỉ bị gỡ liên kết order_id)
 * - Đánh giá >90 ngày, khiếu nại đã đóng >30 ngày, bài đăng >7 ngày (+ ảnh storage)
 * - Giỏ hàng bỏ quên >30 ngày, góp ý đã xử lý >90 ngày
 *
 * Không xóa đơn đang mở (pending/accepted/…).
 */
export async function runDataRetention(db: DbConn, supabase?: SupabaseClient) {
  const deletedNotifications = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, cutoff(NOTIFICATIONS_DAYS)))
    .returning({ id: notifications.id });

  const deletedIdempotency = await db
    .delete(checkoutIdempotencyKeys)
    .where(lt(checkoutIdempotencyKeys.createdAt, cutoff(IDEMPOTENCY_DAYS)))
    .returning({ id: checkoutIdempotencyKeys.id });

  const deletedAudit = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, cutoff(AUDIT_DAYS)))
    .returning({ id: auditLogs.id });

  let deletedProofFiles = 0;
  let deletedComplaintEvidenceFiles = 0;
  let deletedComplaints = 0;
  let deletedReviews = 0;
  let deletedOrders = 0;
  let deletedPosts = 0;
  let deletedPostFiles = 0;
  let deletedCartItems = 0;
  let deletedFeedback = 0;

  await rollupUnaccountedOrders(db);

  // --- Đơn settled quá hạn ---
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

      // Storage: biên lai CK (bản ghi cascade theo orders)
      const proofRows = await db
        .select({ id: paymentProofs.id, imageUrl: paymentProofs.imageUrl })
        .from(paymentProofs)
        .where(inArray(paymentProofs.orderId, chunk));
      if (supabase && proofRows.length) {
        deletedProofFiles += await removeStorageObjects(
          supabase,
          proofRows.map((r) => r.imageUrl),
        );
      }

      // reviews.order_id / complaints.order_id là ON DELETE SET NULL — hồ sơ vẫn sống
      // theo hạn riêng của nó, chỉ mất liên kết tới đơn đã xóa.
      const removedOrders = await db
        .delete(orders)
        .where(inArray(orders.id, chunk))
        .returning({ id: orders.id });
      deletedOrders += removedOrders.length;
    }
  }

  // --- Đánh giá quá hạn (điểm trung bình đã nằm ở sellers.rating_sum/rating_count) ---
  const staleReviews = await db
    .delete(reviews)
    .where(lt(reviews.createdAt, cutoff(REVIEWS_DAYS)))
    .returning({ id: reviews.id });
  deletedReviews = staleReviews.length;

  // --- Khiếu nại đã đóng quá hạn (+ ảnh bằng chứng, messages cascade) ---
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
    if (supabase) {
      const evidence = chunk.flatMap((r) => collectUrls(r.evidenceUrls));
      if (evidence.length) {
        deletedComplaintEvidenceFiles += await removeStorageObjects(supabase, evidence);
      }
    }
    const removed = await db
      .delete(complaints)
      .where(inArray(complaints.id, chunk.map((r) => r.id)))
      .returning({ id: complaints.id });
    deletedComplaints += removed.length;
  }

  // --- Bài đăng quá hạn ---
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
      if (supabase) {
        const urls = chunk.flatMap((p) => collectUrls(p.imageUrl, p.imageUrls));
        if (urls.length) {
          deletedPostFiles += await removeStorageObjects(supabase, urls);
        }
      }
      const removed = await db
        .delete(posts)
        .where(inArray(posts.id, chunk.map((p) => p.id)))
        .returning({ id: posts.id });
      deletedPosts += removed.length;
    }
  }

  // --- Giỏ hàng bỏ quên: xóa dòng hàng, giữ lại vỏ giỏ (1 dòng/user) ---
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

  // --- Góp ý đã xử lý ---
  const removedFeedback = await db
    .delete(siteFeedback)
    .where(and(eq(siteFeedback.status, 'done'), lt(siteFeedback.updatedAt, cutoff(FEEDBACK_DAYS))))
    .returning({ id: siteFeedback.id });
  deletedFeedback = removedFeedback.length;

  return {
    notifications: deletedNotifications.length,
    idempotencyKeys: deletedIdempotency.length,
    auditLogs: deletedAudit.length,
    orders: deletedOrders,
    complaints: deletedComplaints,
    reviews: deletedReviews,
    paymentProofFiles: deletedProofFiles,
    complaintEvidenceFiles: deletedComplaintEvidenceFiles,
    posts: deletedPosts,
    postFiles: deletedPostFiles,
    cartItems: deletedCartItems,
    feedback: deletedFeedback,
  };
}

export function scheduleDataRetention(db: Database, supabase?: SupabaseClient) {
  const run = async () => {
    try {
      const result = await db.transaction(async (tx) => {
        const locked = await tryRetentionXactLock(tx);
        if (!locked) return null;
        return runDataRetention(tx, supabase);
      });
      if (result == null) {
        console.log('[retention] skipped — another instance holds the advisory lock');
        return;
      }
      console.log('[retention]', JSON.stringify(result));
    } catch (err) {
      console.error('[retention] failed', err instanceof Error ? err.message : err);
    }
  };

  // Chạy ngay 1 lần để bù nếu server tắt qua nửa đêm, sau đó mỗi ngày lúc 0h VN.
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
