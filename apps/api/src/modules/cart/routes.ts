import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { cartItems, carts } from '@langdaihoc/database';
import { asyncHandler, AppError } from '../../middleware/error-handler.js';
import { requireAuth, requireActiveBuyer } from '../../middleware/auth.js';
import {
  getCartWithItems,
  getOrCreateCart,
  addToCart,
} from '../../services/commerce.js';

export const cartRouter = Router();

/** DEMO chỉ nới email verify — vẫn bắt role buyer. */
const buyerGuard = [requireAuth, requireActiveBuyer];

cartRouter.get(
  '/',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const data = await getCartWithItems(req.app.locals.db, req.user!.id);
    res.json({ data });
  }),
);

cartRouter.post(
  '/items',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        foodItemId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99).default(1),
        note: z.string().optional(),
        options: z
          .array(z.object({ id: z.string(), name: z.string().optional(), priceDelta: z.number().optional() }))
          .optional(),
        forceClear: z.boolean().optional(),
      })
      .parse(req.body);

    await addToCart(
      req.app.locals.db,
      req.user!.id,
      body.foodItemId,
      body.quantity,
      body.note,
      body.options?.map((o) => ({ id: o.id })),
      body.forceClear,
    );
    const data = await getCartWithItems(req.app.locals.db, req.user!.id);
    res.json({ data });
  }),
);

cartRouter.patch(
  '/items/:id',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const { quantity } = z.object({ quantity: z.number().int().min(1).max(99) }).parse(req.body);
    const db = req.app.locals.db;
    const cart = await getOrCreateCart(db, req.user!.id);
    const [updated] = await db
      .update(cartItems)
      .set({ quantity })
      .where(and(eq(cartItems.id, String(req.params.id)), eq(cartItems.cartId, cart.id)))
      .returning({ id: cartItems.id });
    if (!updated) throw new AppError(404, 'Không tìm thấy món trong giỏ', 'NOT_FOUND');
    const data = await getCartWithItems(db, req.user!.id);
    res.json({ data });
  }),
);

cartRouter.delete(
  '/items/:id',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const cart = await getOrCreateCart(db, req.user!.id);
    const [deleted] = await db
      .delete(cartItems)
      .where(and(eq(cartItems.id, String(req.params.id)), eq(cartItems.cartId, cart.id)))
      .returning({ id: cartItems.id });
    if (!deleted) throw new AppError(404, 'Không tìm thấy món trong giỏ', 'NOT_FOUND');
    const data = await getCartWithItems(db, req.user!.id);
    if (data.items.length === 0) {
      await db
        .update(carts)
        .set({ sellerId: null })
        .where(eq(carts.id, cart.id));
    }
    res.json({ data });
  }),
);

cartRouter.delete(
  '/',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const data = await getCartWithItems(req.app.locals.db, req.user!.id);
    await req.app.locals.db.delete(cartItems).where(eq(cartItems.cartId, data.cart.id));
    await req.app.locals.db
      .update(carts)
      .set({ sellerId: null })
      .where(eq(carts.id, data.cart.id));
    res.json({ message: 'Đã xóa giỏ hàng' });
  }),
);
