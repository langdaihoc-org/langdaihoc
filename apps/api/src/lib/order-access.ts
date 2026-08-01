import type { DbConn } from '@langdaihoc/database';
import { eq } from 'drizzle-orm';
import { orders, sellers } from '@langdaihoc/database';
import { AppError } from '../middleware/error-handler.js';

type Actor = { id: string; role: string };

export type OrderRow = typeof orders.$inferSelect;

/**
 * Load đơn và chặn truy cập chéo: buyer chỉ thấy đơn mình, seller chỉ thấy đơn của quán mình.
 * Dùng cho mọi route thao tác trên /orders/:id.
 */
export async function loadOrderForActor(
  db: DbConn,
  orderId: string,
  actor: Actor,
): Promise<{ order: OrderRow; sellerId: string }> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new AppError(404, 'Không tìm thấy đơn', 'NOT_FOUND');

  if (actor.role === 'admin') return { order, sellerId: order.sellerId };

  if (actor.role === 'buyer') {
    if (order.buyerId !== actor.id) throw new AppError(403, 'Không có quyền', 'FORBIDDEN');
    return { order, sellerId: order.sellerId };
  }

  if (actor.role === 'seller') {
    const [seller] = await db
      .select({ id: sellers.id, status: sellers.status })
      .from(sellers)
      .where(eq(sellers.userId, actor.id))
      .limit(1);
    if (!seller || order.sellerId !== seller.id) {
      throw new AppError(403, 'Không có quyền', 'FORBIDDEN');
    }
    return { order, sellerId: seller.id };
  }

  throw new AppError(403, 'Không có quyền', 'FORBIDDEN');
}

/**
 * Seller chỉ được mutate đơn (status / quote / payment) khi shop còn approved.
 * Suspend / pending / rejected → 403 SELLER_NOT_APPROVED.
 */
export async function assertSellerApprovedToMutate(db: DbConn, actor: Actor): Promise<void> {
  if (actor.role !== 'seller') return;
  const [seller] = await db
    .select({ status: sellers.status })
    .from(sellers)
    .where(eq(sellers.userId, actor.id))
    .limit(1);
  if (!seller || seller.status !== 'approved') {
    throw new AppError(
      403,
      'Tài khoản đối tác chưa được duyệt hoặc đã bị khóa',
      'SELLER_NOT_APPROVED',
    );
  }
}
