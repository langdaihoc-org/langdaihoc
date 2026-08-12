import { lt, and, inArray, sql } from 'drizzle-orm';
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
/** Đơn đã kết thúc (completed/cancelled/rejected) + khiếu nại/review theo đơn — 7 ngày */
const SETTLED_ORDER_DAYS = 7;
/** Bài đăng feed — 7 ngày (theo createdAt) */
const POSTS_DAYS = 7;
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
 * Purge theo lịch:
 * - Thông báo / idempotency / audit (như cũ)
 * - Đơn settled >7 ngày → xóa khiếu nại (+ messages cascade), review, rồi orders
 *   (items / laundry / ship_proxy / status history / payment_proofs cascade)
 * - Bài đăng >7 ngày (+ ảnh storage)
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

      // Storage: biên lai CK
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

      // Storage: bằng chứng khiếu nại
      const complaintRows = await db
        .select({
          id: complaints.id,
          evidenceUrls: complaints.evidenceUrls,
        })
        .from(complaints)
        .where(inArray(complaints.orderId, chunk));
      if (supabase && complaintRows.length) {
        const evidence = complaintRows.flatMap((r) => collectUrls(r.evidenceUrls));
        if (evidence.length) {
          deletedComplaintEvidenceFiles += await removeStorageObjects(supabase, evidence);
        }
      }

      // FK no-cascade: complaints (messages cascade), reviews → rồi orders
      if (complaintRows.length) {
        const removed = await db
          .delete(complaints)
          .where(inArray(complaints.id, complaintRows.map((r) => r.id)))
          .returning({ id: complaints.id });
        deletedComplaints += removed.length;
      } else {
        const removed = await db
          .delete(complaints)
          .where(inArray(complaints.orderId, chunk))
          .returning({ id: complaints.id });
        deletedComplaints += removed.length;
      }

      const removedReviews = await db
        .delete(reviews)
        .where(inArray(reviews.orderId, chunk))
        .returning({ id: reviews.id });
      deletedReviews += removedReviews.length;

      const removedOrders = await db
        .delete(orders)
        .where(inArray(orders.id, chunk))
        .returning({ id: orders.id });
      deletedOrders += removedOrders.length;
    }
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
