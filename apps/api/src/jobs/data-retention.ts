import { lt, and, inArray, desc } from 'drizzle-orm';
import type { Database } from '@langdaihoc/database';
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
/** Idempotency key checkout — 3 ngày */
const IDEMPOTENCY_DAYS = 3;
/** Audit log — 30 ngày */
const AUDIT_DAYS = 30;
/** Timeline trạng thái đơn (rút gọn về 1 bản cuối) — 7 ngày */
const ORDER_HISTORY_DAYS = 7;
/** Biên lai CK — xóa theo đơn đã hoàn tất/huỷ (cùng cutoff với history) */
const PROOF_DAYS = ORDER_HISTORY_DAYS;

function cutoff(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** @deprecated — giữ để compat smoke/import cũ */
export function retentionCutoff(days = ORDER_HISTORY_DAYS) {
  return cutoff(days);
}

/** Purge ephemeral data. Orders/reviews/complaints/master data không bị xóa. */
export async function runDataRetention(db: Database, supabase?: SupabaseClient) {
  // 1. Thông báo — 7 ngày
  const deletedNotifications = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, cutoff(NOTIFICATIONS_DAYS)))
    .returning({ id: notifications.id });

  // 2. Idempotency keys — 3 ngày
  const deletedIdempotency = await db
    .delete(checkoutIdempotencyKeys)
    .where(lt(checkoutIdempotencyKeys.createdAt, cutoff(IDEMPOTENCY_DAYS)))
    .returning({ id: checkoutIdempotencyKeys.id });

  // 3. Audit log — 30 ngày
  const deletedAudit = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, cutoff(AUDIT_DAYS)))
    .returning({ id: auditLogs.id });

  // 4. Biên lai CK + timeline trạng thái của đơn đã settled > PROOF_DAYS ngày
  const settled = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        inArray(orders.status, ['completed', 'cancelled', 'rejected']),
        lt(orders.createdAt, cutoff(PROOF_DAYS)),
      ),
    );

  let deletedProofs = 0;
  let deletedProofFiles = 0;
  let deletedHistory = 0;

  if (settled.length > 0) {
    const orderIds = settled.map((r) => r.id);

    // 4a. Biên lai — xóa file storage rồi xóa row
    const chunkSize = 500;
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize);
      const rows = await db
        .select({ id: paymentProofs.id, imageUrl: paymentProofs.imageUrl })
        .from(paymentProofs)
        .where(inArray(paymentProofs.orderId, chunk));

      if (supabase && rows.length) {
        deletedProofFiles += await removeStorageObjects(
          supabase,
          rows.map((r) => r.imageUrl),
        );
      }

      const removed = await db
        .delete(paymentProofs)
        .where(inArray(paymentProofs.orderId, chunk))
        .returning({ id: paymentProofs.id });
      deletedProofs += removed.length;
    }

    // 4b. Timeline trạng thái — giữ bản mới nhất, xóa phần cũ hơn cutoff
    const history = await db
      .select({
        id: orderStatusHistory.id,
        orderId: orderStatusHistory.orderId,
        createdAt: orderStatusHistory.createdAt,
      })
      .from(orderStatusHistory)
      .where(inArray(orderStatusHistory.orderId, orderIds))
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
      for (let i = 0; i < staleIds.length; i += chunkSize) {
        const chunk = staleIds.slice(i, i + chunkSize);
        const removed = await db
          .delete(orderStatusHistory)
          .where(inArray(orderStatusHistory.id, chunk))
          .returning({ id: orderStatusHistory.id });
        deletedHistory += removed.length;
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
    const result = await runDataRetention(db, supabase);
    console.log('[retention]', JSON.stringify(result));
  };

  // Chạy ngay 1 lần để bù nếu server tắt qua nửa đêm, sau đó mỗi ngày lúc 0h VN.
  void run();
  return scheduleDailyAtMidnight('retention', run);
}
