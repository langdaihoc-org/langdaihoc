import { lt, and, inArray, desc, sql } from 'drizzle-orm';
import type { Database, DbConn } from '@langdaihoc/database';
import {
  notifications,
  orderStatusHistory,
  auditLogs,
  orders,
  checkoutIdempotencyKeys,
  paymentProofs,
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
/** Timeline trạng thái đơn (rút gọn về 1 bản cuối) — 7 ngày */
const ORDER_HISTORY_DAYS = 7;
/** Biên lai CK — xóa theo đơn đã hoàn tất/huỷ (cutoff theo updatedAt khi settled) */
const PROOF_DAYS = ORDER_HISTORY_DAYS;
/** pg_advisory_xact_lock key — an toàn với connection pool (nhả khi commit/rollback). */
const RETENTION_LOCK_KEY = 7_714_201;

function cutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** @deprecated — giữ để compat smoke/import cũ */
export function retentionCutoff(days = ORDER_HISTORY_DAYS) {
  return cutoff(days);
}

/** Purge ephemeral data. Orders/reviews/complaints/master data không bị xóa. */
export async function runDataRetention(db: DbConn, supabase?: SupabaseClient) {
  // 1. Thông báo — 7 ngày
  const deletedNotifications = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, cutoff(NOTIFICATIONS_DAYS)))
    .returning({ id: notifications.id });

  // 2. Idempotency keys — 14 ngày
  const deletedIdempotency = await db
    .delete(checkoutIdempotencyKeys)
    .where(lt(checkoutIdempotencyKeys.createdAt, cutoff(IDEMPOTENCY_DAYS)))
    .returning({ id: checkoutIdempotencyKeys.id });

  // 3. Audit log — 30 ngày
  const deletedAudit = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, cutoff(AUDIT_DAYS)))
    .returning({ id: auditLogs.id });

  // 4. Biên lai CK + timeline — xử lý theo chunk settled orders (tránh load cả bảng)
  const settled = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        inArray(orders.status, ['completed', 'cancelled', 'rejected']),
        lt(orders.updatedAt, cutoff(PROOF_DAYS)),
      ),
    );

  let deletedProofs = 0;
  let deletedProofFiles = 0;
  let deletedHistory = 0;
  const chunkSize = 500;

  if (settled.length > 0) {
    const orderIds = settled.map((r) => r.id);

    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize);
      const rows = await db
        .select({ id: paymentProofs.id, imageUrl: paymentProofs.imageUrl })
        .from(paymentProofs)
        .where(inArray(paymentProofs.orderId, chunk));

      if (rows.length === 0) continue;

      let filesOk = true;
      if (supabase) {
        const removed = await removeStorageObjects(
          supabase,
          rows.map((r) => r.imageUrl),
        );
        deletedProofFiles += removed;
        // Chỉ xóa DB khi storage remove không báo lỗi từng chunk — removeStorageObjects
        // trả số object đã xóa; nếu 0 trong khi có URL thì giữ row để thử lại.
        if (removed < rows.length) {
          filesOk = false;
          console.error(
            `[retention] skip DB proof delete: removed ${removed}/${rows.length} files`,
          );
        }
      }

      if (!filesOk) continue;

      const removed = await db
        .delete(paymentProofs)
        .where(inArray(paymentProofs.id, rows.map((r) => r.id)))
        .returning({ id: paymentProofs.id });
      deletedProofs += removed.length;
    }

    // 4b. Timeline — chunk theo orderIds
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize);
      const history = await db
        .select({
          id: orderStatusHistory.id,
          orderId: orderStatusHistory.orderId,
          createdAt: orderStatusHistory.createdAt,
        })
        .from(orderStatusHistory)
        .where(inArray(orderStatusHistory.orderId, chunk))
        .orderBy(desc(orderStatusHistory.createdAt));

      const keepLatest = new Set<string>();
      const staleIds: string[] = [];
      const historyCutoff = cutoff(ORDER_HISTORY_DAYS);
      for (const row of history) {
        if (!keepLatest.has(row.orderId)) {
          keepLatest.add(row.orderId);
          continue;
        }
        if (row.createdAt < historyCutoff) staleIds.push(row.id);
      }

      if (staleIds.length) {
        for (let j = 0; j < staleIds.length; j += chunkSize) {
          const idChunk = staleIds.slice(j, j + chunkSize);
          const removed = await db
            .delete(orderStatusHistory)
            .where(inArray(orderStatusHistory.id, idChunk))
            .returning({ id: orderStatusHistory.id });
          deletedHistory += removed.length;
        }
      }
    }
  }

  return {
    notifications: deletedNotifications.length,
    idempotencyKeys: deletedIdempotency.length,
    auditLogs: deletedAudit.length,
    paymentProofs: deletedProofs,
    paymentProofFiles: deletedProofFiles,
    orderStatusHistory: deletedHistory,
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
