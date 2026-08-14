import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { eq, and, asc, sql } from 'drizzle-orm';
import {
  orders,
  orderItems,
  laundryOrderDetails,
  shipProxyOrderDetails,
  orderStatusHistory,
  paymentProofs,
  reviews,
  complaints,
  complaintMessages,
  profiles,
  sellers,
  sellerBankAccounts,
  carts,
  sellerCounters,
  buyerCounters,
} from '@langdaihoc/database';
import type { Database } from '@langdaihoc/database';
import { asyncHandler, AppError } from '../../middleware/error-handler.js';
import { requireAuth, requireActiveBuyer, requireRole } from '../../middleware/auth.js';
import {
  checkoutFood,
  createLaundryOrder,
  createShipProxyOrder,
  transitionOrder,
  getOrdersForUser,
  enrichOrdersList,
  countOrdersByScope,
  isPgUniqueViolation,
  notifyUser,
} from '../../services/commerce.js';
import { refreshSellerCounters, bumpSellerRating } from '../../services/counters.js';
import { formatOrderSummary } from '@langdaihoc/shared';
import { paramId } from '../../lib/params.js';
import {
  assertPrivateProofUrlForOrder,
  assertPrivateProofUrlsForOrder,
  assertPrivateProofObjectExists,
  resignPrivateUrl,
  resignPrivateUrls,
} from '../../lib/storage.js';
import { loadOrderForActor, assertSellerApprovedToMutate } from '../../lib/order-access.js';

export const ordersRouter = Router();

/** DEMO chỉ nới email verify (trong requireAuth) — vẫn bắt role buyer. */
const buyerGuard = [requireAuth, requireActiveBuyer];

/**
 * Rate limiters cho order endpoints.
 * prod: giới hạn chặt; dev/test: nới rộng để smoke/e2e không bị chặn.
 */
const IS_PROD = process.env.NODE_ENV === 'production';

/** Tạo đơn (checkout food / laundry / ship) — 20 đơn/5 phút/IP (prod) */
const createOrderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: IS_PROD ? 20 : 500,
  message: { error: { message: 'Quá nhiều đơn, vui lòng thử lại sau', code: 'RATE_LIMIT' } },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Gửi biên lai CK — 10 lần/5 phút/IP (prod) */
const proofLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: IS_PROD ? 10 : 200,
  message: { error: { message: 'Quá nhiều lần gửi biên lai, thử lại sau', code: 'RATE_LIMIT' } },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Pulse nhẹ — 1–2 query aggregate, không join items/address.
 * Seller + buyer cùng endpoint; FE chỉ tải full list khi fingerprint đổi.
 */
ordersRouter.get(
  '/pulse',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db as Database;
    const role = req.user!.role;

    if (role === 'seller') {
      const [seller] = await db
        .select({ id: sellers.id })
        .from(sellers)
        .where(eq(sellers.userId, req.user!.id))
        .limit(1);
      if (!seller) {
        res.json({
          data: {
            pendingCount: 0,
            openCount: 0,
            lateWarningCount: 0,
            openComplaintCount: 0,
            latestCreatedAt: null as string | null,
            latestUpdatedAt: null as string | null,
            latestLateWarningAt: null as string | null,
            unreadNotifications: 0,
            latestNotificationAt: null as string | null,
          },
        });
        return;
      }

      const [row] = await db.select().from(sellerCounters).where(eq(sellerCounters.sellerId, seller.id)).limit(1);

      res.json({
        data: {
          pendingCount: row?.pendingCount ?? 0,
          openCount: row?.openCount ?? 0,
          lateWarningCount: row?.lateWarningCount ?? 0,
          openComplaintCount: row?.openComplaintCount ?? 0,
          latestCreatedAt: row?.latestOrderAt ?? null,
          latestUpdatedAt: row?.latestChangeAt ?? null,
          latestLateWarningAt: row?.lateWarningCount ? (row?.latestChangeAt ?? null) : null,
          latestComplaintAt: row?.openComplaintCount ? (row?.latestChangeAt ?? null) : null,
          unreadNotifications: row?.unreadCount ?? 0,
          latestNotificationAt: row?.latestNotificationAt ?? null,
          version: row?.version ?? 0,
        },
      });
      return;
    }

    if (role === 'buyer') {
      const [orderRow] = await db.select().from(buyerCounters).where(eq(buyerCounters.userId, req.user!.id)).limit(1);

      res.json({
        data: {
          // Đơn cần buyer phản hồi (vd. chốt giá giặt) → poll mau hơn
          pendingCount: orderRow?.pendingCount ?? 0,
          openCount: orderRow?.openCount ?? 0,
          latestCreatedAt: orderRow?.latestOrderAt ?? null,
          latestUpdatedAt: orderRow?.latestChangeAt ?? null,
          unreadNotifications: orderRow?.unreadCount ?? 0,
          latestNotificationAt: orderRow?.latestNotificationAt ?? null,
          version: orderRow?.version ?? 0,
        },
      });
      return;
    }

    res.json({
      data: {
        pendingCount: 0,
        openCount: 0,
        latestCreatedAt: null as string | null,
        latestUpdatedAt: null as string | null,
        unreadNotifications: 0,
        latestNotificationAt: null as string | null,
      },
    });
  }),
);

ordersRouter.get(
  '/bank-info/:sellerId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const sellerId = paramId(req, 'sellerId');

    /** Chỉ trả STK khi người gọi thực sự có việc chuyển khoản cho quán này. */
    if (req.user!.role !== 'admin') {
      let allowed = false;
      if (req.user!.role === 'seller') {
        const [own] = await db
          .select({ id: sellers.id })
          .from(sellers)
          .where(eq(sellers.userId, req.user!.id))
          .limit(1);
        allowed = own?.id === sellerId;
      } else {
        const [order] = await db
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.buyerId, req.user!.id), eq(orders.sellerId, sellerId)))
          .limit(1);
        allowed = !!order;
        if (!allowed) {
          const [cart] = await db
            .select({ sellerId: carts.sellerId })
            .from(carts)
            .where(eq(carts.userId, req.user!.id))
            .limit(1);
          allowed = cart?.sellerId === sellerId;
        }
      }
      if (!allowed) throw new AppError(403, 'Không có quyền', 'FORBIDDEN');
    }

    const accounts = await db
      .select()
      .from(sellerBankAccounts)
      .where(
        and(
          eq(sellerBankAccounts.sellerId, sellerId),
          eq(sellerBankAccounts.isActive, true),
        ),
      );
    const sorted = [...accounts].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    const preferred = sorted.find((a) => a.isDefault) ?? sorted[0] ?? null;
    res.json({ data: preferred, accounts: sorted });
  }),
);

ordersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const summaryOnly = req.query.view === 'summary';
    const rawScope = typeof req.query.scope === 'string' ? req.query.scope : 'all';
    const scope =
      rawScope === 'active' || rawScope === 'delivering' || rawScope === 'done' || rawScope === 'all'
        ? rawScope
        : 'all';
    const db = req.app.locals.db;
    // Tải thêm 1 để biết còn trang sau không
    const [rows, counts] = await Promise.all([
      getOrdersForUser(db, req.user!.id, req.user!.role, page, limit + 1, scope),
      countOrdersByScope(db, req.user!.id, req.user!.role),
    ]);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const isSeller = req.user!.role === 'seller';
    const data = await enrichOrdersList(db, pageRows, {
      includeBuyer: isSeller,
      includeDetails: !summaryOnly,
    });
    const meta = { page, limit, hasMore, scope, counts };
    if (summaryOnly) {
      res.json({ data, meta });
      return;
    }
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    const allProofUrls: string[] = [];
    for (const row of data) {
      const proofs = (row as { proofs?: { id: string; imageUrl: string; status: string }[] }).proofs;
      if (proofs?.length) allProofUrls.push(...proofs.map((p) => p.imageUrl));
    }
    const resigned = allProofUrls.length
      ? await resignPrivateUrls(supabaseAdmin, allProofUrls)
      : [];
    let proofCursor = 0;
    for (const row of data) {
      const proofs = (row as { proofs?: { id: string; imageUrl: string; status: string }[] }).proofs;
      if (!proofs?.length) continue;
      (row as { proofs: typeof proofs }).proofs = proofs.map((p) => ({
        ...p,
        imageUrl: resigned[proofCursor++] ?? p.imageUrl,
      }));
    }
    res.json({ data, meta });
  }),
);

ordersRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const orderId = paramId(req);
    const { order } = await loadOrderForActor(db, orderId, req.user!);

    const [items, laundry, shipProxy, history, proofs, reviewRows, complaintRows, sellerRows] =
      await Promise.all([
        order.type === 'food'
          ? db.select().from(orderItems).where(eq(orderItems.orderId, order.id))
          : Promise.resolve([] as Awaited<ReturnType<typeof db.select>>),
        order.type === 'laundry'
          ? db.select().from(laundryOrderDetails).where(eq(laundryOrderDetails.orderId, order.id)).limit(1)
          : Promise.resolve([] as Awaited<ReturnType<typeof db.select>>),
        order.type === 'ship_proxy'
          ? db
              .select()
              .from(shipProxyOrderDetails)
              .where(eq(shipProxyOrderDetails.orderId, order.id))
              .limit(1)
          : Promise.resolve([] as Awaited<ReturnType<typeof db.select>>),
        db
          .select()
          .from(orderStatusHistory)
          .where(eq(orderStatusHistory.orderId, order.id))
          .orderBy(asc(orderStatusHistory.createdAt)),
        db.select().from(paymentProofs).where(eq(paymentProofs.orderId, order.id)),
        db.select().from(reviews).where(eq(reviews.orderId, order.id)).limit(1),
        db.select().from(complaints).where(eq(complaints.orderId, order.id)).limit(1),
        db
          .select({
            shopName: sellers.shopName,
            phone: profiles.phone,
            fullName: profiles.fullName,
          })
          .from(sellers)
          .innerJoin(profiles, eq(sellers.userId, profiles.id))
          .where(eq(sellers.id, order.sellerId))
          .limit(1),
      ]);

    const review = reviewRows[0];
    const complaint = complaintRows[0];
    const sellerRow = sellerRows[0];
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    const complaintThread = complaint
      ? await db
          .select({
            id: complaintMessages.id,
            body: complaintMessages.body,
            authorRole: complaintMessages.authorRole,
            createdAt: complaintMessages.createdAt,
            authorName: profiles.fullName,
          })
          .from(complaintMessages)
          .innerJoin(profiles, eq(complaintMessages.authorId, profiles.id))
          .where(eq(complaintMessages.complaintId, complaint.id))
          .orderBy(asc(complaintMessages.createdAt))
      : [];

    const proofsFresh = await Promise.all(
      (proofs as { id: string; imageUrl: string; status: string }[]).map(async (p) => ({
        ...p,
        imageUrl: await resignPrivateUrl(supabaseAdmin, p.imageUrl),
      })),
    );
    const complaintFresh = complaint
      ? {
          ...complaint,
          evidenceUrls: await resignPrivateUrls(supabaseAdmin, complaint.evidenceUrls ?? []),
        }
      : null;

    res.json({
      data: {
        order: {
          ...order,
          summary: formatOrderSummary(
            order.type,
            items.map((i: { itemName: string; quantity: number }) => ({ itemName: i.itemName, quantity: i.quantity })),
            laundry[0] ?? null,
            shipProxy[0] ?? null,
          ),
        },
        items: items.map((i: {
          itemName: string;
          quantity: number;
          lineTotal: string;
          note?: string | null;
          optionsSnapshot?: { id?: string; name: string; priceDelta?: number }[] | null;
        }) => ({
          itemName: i.itemName,
          quantity: i.quantity,
          lineTotal: i.lineTotal,
          note: i.note ?? null,
          options: Array.isArray(i.optionsSnapshot) ? i.optionsSnapshot : [],
        })),
        laundry: laundry[0] ?? null,
        shipProxy: shipProxy[0] ?? null,
        sellerContact: sellerRow
          ? { shopName: sellerRow.shopName, phone: sellerRow.phone, fullName: sellerRow.fullName }
          : null,
        history,
        proofs: proofsFresh,
        review: review ?? null,
        complaint: complaintFresh,
        complaintMessages: complaintThread,
      },
    });
  }),
);

ordersRouter.post(
  '/food/checkout',
  createOrderLimiter,
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        addressId: z.string().uuid(),
        phone: z.string().min(9),
        paymentMethod: z.enum(['cash', 'bank_transfer']),
        desiredDeliveryAt: z.string().optional(),
        desiredDeliveryUntil: z.string().optional(),
        notes: z.string().optional(),
        idempotencyKey: z.string().uuid().optional(),
      })
      .parse(req.body);
    const headerKey = req.get('Idempotency-Key')?.trim();
    const idempotencyKey = headerKey || body.idempotencyKey;
    if (!idempotencyKey) {
      throw new AppError(
        400,
        'Thiếu Idempotency-Key (header hoặc body) — bắt buộc để tránh đặt trùng đơn',
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    }
    const { idempotencyKey: _ignored, ...checkoutBody } = body;
    const order = await checkoutFood(
      req.app.locals.db,
      req.user!.id,
      checkoutBody,
      idempotencyKey,
    );
    res.status(201).json({ data: order });
  }),
);

ordersRouter.post(
  '/laundry',
  createOrderLimiter,
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        serviceId: z.string().uuid(),
        estimatedQty: z.number().positive().optional().default(1),
        pickupScheduledAt: z.string(),
        returnScheduledAt: z.string().optional(),
        pickupAddressId: z.string().uuid(),
        returnAddressId: z.string().uuid(),
        phone: z.string().min(9),
        notes: z.string().optional(),
        paymentMethod: z.enum(['cash', 'bank_transfer']),
        autoConfirmQuote: z.boolean().optional(),
        idempotencyKey: z.string().uuid().optional(),
      })
      .parse(req.body);
    const headerKey = req.get('Idempotency-Key')?.trim();
    const idempotencyKey = headerKey || body.idempotencyKey;
    if (!idempotencyKey) {
      throw new AppError(
        400,
        'Thiếu Idempotency-Key (header hoặc body) — bắt buộc để tránh đặt trùng đơn',
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    }
    const { idempotencyKey: _ignored, ...orderBody } = body;
    const order = await createLaundryOrder(req.app.locals.db, req.user!.id, orderBody, idempotencyKey);
    res.status(201).json({ data: order });
  }),
);

ordersRouter.post(
  '/ship-proxy',
  createOrderLimiter,
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        sellerId: z.string().uuid(),
        trackingCode: z.string().trim().min(2).max(120),
        pickupLocation: z.string().trim().min(3).max(500),
        pickupAt: z.string().min(1),
        receivePhone: z.string().trim().min(9).max(15),
        returnAt: z.string().min(1),
        returnAddressText: z.string().trim().min(1).max(500),
        contactPhone: z.string().trim().min(9).max(15),
        packageValue: z.coerce.number().positive().max(100_000_000),
        notes: z.string().trim().max(500).optional(),
        idempotencyKey: z.string().uuid().optional(),
      })
      .parse(req.body);
    const headerKey = req.get('Idempotency-Key')?.trim();
    const idempotencyKey = headerKey || body.idempotencyKey;
    if (!idempotencyKey) {
      throw new AppError(
        400,
        'Thiếu Idempotency-Key (header hoặc body) — bắt buộc để tránh đặt trùng đơn',
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    }
    const { idempotencyKey: _ignored, ...orderBody } = body;
    const order = await createShipProxyOrder(req.app.locals.db, req.user!.id, orderBody, idempotencyKey);
    res.status(201).json({ data: order });
  }),
);

ordersRouter.patch(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status, note } = z
      .object({ status: z.string(), note: z.string().optional() })
      .parse(req.body);
    const db = req.app.locals.db;
    const orderId = paramId(req);
    await loadOrderForActor(db, orderId, req.user!);
    await assertSellerApprovedToMutate(db, req.user!);
    const order = await transitionOrder(db, orderId, status, req.user!.id, req.user!.role, note);
    res.json({ data: order });
  }),
);

ordersRouter.post(
  '/:id/laundry-quote',
  requireAuth,
  requireRole('seller'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        finalPrice: z.number().positive().optional(),
        actualQty: z.number().positive().optional(),
        unitPrice: z.number().positive().optional(),
        surcharge: z.number().optional(),
        sellerNote: z.string().optional(),
      })
      .refine(
        (v) =>
          (v.finalPrice != null && v.finalPrice > 0) ||
          (v.actualQty != null && v.unitPrice != null),
        { message: 'Cần finalPrice hoặc actualQty + unitPrice' },
      )
      .parse(req.body);
    const db: Database = req.app.locals.db;
    const id = paramId(req);
    const { order: existing } = await loadOrderForActor(db, id, req.user!);
    await assertSellerApprovedToMutate(db, req.user!);
    if (existing.type !== 'laundry') {
      throw new AppError(400, 'Đơn này không phải đơn giặt', 'INVALID_ORDER_TYPE');
    }
    const finalPrice =
      body.finalPrice != null && body.finalPrice > 0
        ? Math.round(body.finalPrice)
        : Math.round((body.actualQty ?? 0) * (body.unitPrice ?? 0) + (body.surcharge ?? 0));
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      throw new AppError(400, 'Tổng báo giá không hợp lệ', 'INVALID_QUOTE');
    }

    if (
      existing.paymentMethod === 'bank_transfer' &&
      (existing.paymentStatus === 'verified' || existing.paymentStatus === 'paid')
    ) {
      throw new AppError(
        409,
        'Đã xác nhận thanh toán — không thể đổi báo giá. Liên hệ admin nếu cần hỗ trợ.',
        'PAYMENT_LOCKED',
      );
    }

    const prevTotal = Math.round(Number(existing.total));
    const totalChanged = Number.isFinite(prevTotal) && prevTotal > 0 && prevTotal !== finalPrice;
    const mustResetProof =
      existing.paymentMethod === 'bank_transfer' &&
      totalChanged &&
      (existing.paymentStatus === 'proof_uploaded' || existing.paymentStatus === 'rejected');

    /** Ghi giá và chuyển trạng thái cùng một transaction — transition lỗi thì giá cũng rollback. */
    const [detailRow] = await db
      .select({ autoConfirmQuote: laundryOrderDetails.autoConfirmQuote })
      .from(laundryOrderDetails)
      .where(eq(laundryOrderDetails.orderId, id))
      .limit(1);
    const autoConfirm = !!detailRow?.autoConfirmQuote;

    const order = await db.transaction(async (tx) => {
      await tx
        .update(laundryOrderDetails)
        .set({
          ...(body.actualQty != null ? { actualQty: String(body.actualQty) } : {}),
          ...(body.unitPrice != null ? { unitPrice: String(body.unitPrice) } : {}),
          surcharge: String(body.surcharge ?? 0),
          finalPrice: String(finalPrice),
          sellerNote: body.sellerNote,
          ...(autoConfirm ? { buyerPriceConfirmedAt: new Date() } : {}),
        })
        .where(eq(laundryOrderDetails.orderId, id));

      const [priced] = await tx
        .update(orders)
        .set({
          subtotal: String(finalPrice),
          total: String(finalPrice),
          updatedAt: new Date(),
          ...(mustResetProof
            ? { paymentStatus: 'pending' as const, version: existing.version + 1 }
            : {}),
        })
        .where(
          mustResetProof
            ? and(eq(orders.id, id), eq(orders.version, existing.version))
            : eq(orders.id, id),
        )
        .returning({ id: orders.id });
      if (mustResetProof && !priced) {
        throw new AppError(409, 'Đơn đã được cập nhật bởi người khác', 'VERSION_CONFLICT');
      }

      if (mustResetProof) {
        await tx
          .update(paymentProofs)
          .set({
            status: 'rejected',
            rejectionReason: `Báo giá mới ${finalPrice.toLocaleString('vi-VN')}đ — vui lòng chuyển khoản đúng số tiền mới và gửi lại biên lai`,
            reviewedAt: new Date(),
            reviewedBy: req.user!.id,
          })
          .where(
            and(
              eq(paymentProofs.orderId, id),
              sql`${paymentProofs.status} not in ('verified')`,
            ),
          );
        await notifyUser(
          tx,
          existing.buyerId,
          'payment_rejected',
          'Báo giá mới — cần chuyển khoản lại',
          `Đơn ${existing.orderCode}: giá chốt ${finalPrice.toLocaleString('vi-VN')}đ (khác số tiền trước). Vui lòng CK đúng số mới và gửi lại biên lai.`,
          { orderId: id, orderCode: existing.orderCode },
        );
      }

      let result = await transitionOrder(
        tx,
        id,
        'waiting_price_confirmation',
        req.user!.id,
        req.user!.role,
      );
      if (autoConfirm) {
        result = await transitionOrder(tx, id, 'washing', req.user!.id, req.user!.role);
      }
      return result;
    });
    res.json({ data: order });
  }),
);

ordersRouter.post(
  '/:id/confirm-price',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const db: Database = req.app.locals.db;
    const id = paramId(req);
    await loadOrderForActor(db, id, req.user!);
    const order = await db.transaction(async (tx) => {
      await tx
        .update(laundryOrderDetails)
        .set({ buyerPriceConfirmedAt: new Date() })
        .where(eq(laundryOrderDetails.orderId, id));
      return transitionOrder(tx, id, 'washing', req.user!.id, req.user!.role);
    });
    res.json({ data: order });
  }),
);

/** Buyer nhắc quán: sắp tới giờ giao mà chưa được gọi điện. */
ordersRouter.post(
  '/:id/late-delivery-warning',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const db: Database = req.app.locals.db;
    const id = paramId(req);
    const { order } = await loadOrderForActor(db, id, req.user!);

    if (order.buyerId !== req.user!.id) {
      throw new AppError(403, 'Không có quyền', 'FORBIDDEN');
    }
    if (order.type !== 'food') {
      throw new AppError(400, 'Chỉ áp dụng đơn ăn uống', 'INVALID_ORDER_TYPE');
    }
    if (['completed', 'cancelled', 'rejected', 'needs_support'].includes(order.status)) {
      throw new AppError(400, 'Đơn đã kết thúc', 'ORDER_CLOSED');
    }
    const dueAt = order.desiredDeliveryUntil ?? order.desiredDeliveryAt;
    if (!dueAt) {
      throw new AppError(400, 'Đơn chưa có giờ giao mong muốn', 'NO_DELIVERY_TIME');
    }
    if (order.lateDeliveryWarnedAt) {
      throw new AppError(409, 'Bạn đã gửi cảnh báo cho đơn này', 'ALREADY_WARNED');
    }

    const due = new Date(dueAt).getTime();
    const openAt = due - 10 * 60 * 1000;
    if (Number.isNaN(due) || Date.now() < openAt) {
      throw new AppError(
        400,
        'Chỉ gửi được từ 10 phút trước giờ giao mong muốn',
        'TOO_EARLY',
      );
    }

    const now = new Date();
    const [updated] = await db
      .update(orders)
      .set({ lateDeliveryWarnedAt: now, updatedAt: now })
      .where(and(eq(orders.id, id), sql`${orders.lateDeliveryWarnedAt} is null`))
      .returning();
    if (!updated) {
      throw new AppError(409, 'Bạn đã gửi cảnh báo cho đơn này', 'ALREADY_WARNED');
    }

    const [seller] = await db
      .select({ userId: sellers.userId, shopName: sellers.shopName })
      .from(sellers)
      .where(eq(sellers.id, order.sellerId))
      .limit(1);
    if (seller) {
      const when = order.desiredDeliveryUntil
        ? `${new Date(order.desiredDeliveryAt!).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}–${new Date(order.desiredDeliveryUntil).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${new Date(order.desiredDeliveryAt!).toLocaleDateString('vi-VN')}`
        : new Date(dueAt).toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
      await notifyUser(
        db,
        seller.userId,
        'late_delivery_warning',
        'Cảnh báo trễ đơn',
        `Khách báo chưa được gọi giao — đơn ${order.orderCode}, mong muốn ${when}.`,
        { orderId: order.id, orderCode: order.orderCode },
      );
    }

    await refreshSellerCounters(db, order.sellerId);

    res.json({
      data: updated,
      message: 'Đã gửi cảnh báo cho quán',
    });
  }),
);

ordersRouter.post(
  '/:id/reject-price',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const db: Database = req.app.locals.db;
    const id = paramId(req);
    await loadOrderForActor(db, id, req.user!);
    const order = await db.transaction(async (tx) => {
      await tx
        .update(laundryOrderDetails)
        .set({ priceRejectedAt: new Date() })
        .where(eq(laundryOrderDetails.orderId, id));
      return transitionOrder(tx, id, 'cancelled', req.user!.id, req.user!.role, 'price_rejected');
    });
    res.json({ data: order });
  }),
);

ordersRouter.post(
  '/:id/payment-proof',
  proofLimiter,
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const orderId = paramId(req);
    const { imageUrl: raw } = z.object({ imageUrl: z.string().min(5) }).parse(req.body);
    const db: Database = req.app.locals.db;
    const { order } = await loadOrderForActor(db, orderId, req.user!);
    const imageUrl = assertPrivateProofUrlForOrder(raw, req.user!.id, orderId, 'Ảnh biên lai');
    if (!imageUrl) throw new AppError(400, 'Ảnh biên lai bắt buộc', 'INVALID_IMAGE_URL');
    await assertPrivateProofObjectExists(req.app.locals.supabaseAdmin, imageUrl, 'Ảnh biên lai');
    if (order.paymentMethod !== 'bank_transfer') {
      throw new AppError(400, 'Đơn này không thanh toán chuyển khoản', 'INVALID_PAYMENT_METHOD');
    }
    if (order.status === 'pending') {
      throw new AppError(
        409,
        'Quán chưa xác nhận đơn — vui lòng chờ quán nhận đơn rồi mới chuyển khoản và gửi biên lai',
        'WAIT_SELLER_ACCEPT',
      );
    }
    if (order.status === 'cancelled' || order.status === 'rejected') {
      throw new AppError(409, 'Đơn đã đóng, không thể gửi biên lai', 'ORDER_CLOSED');
    }
    if (order.paymentStatus === 'verified' || order.paymentStatus === 'paid') {
      throw new AppError(409, 'Đơn đã được xác nhận thanh toán', 'ALREADY_PAID');
    }
    const proof = await db.transaction(async (tx) => {
      const [ord] = await tx
        .update(orders)
        .set({ paymentStatus: 'proof_uploaded', updatedAt: new Date() })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.version, order.version),
            sql`${orders.paymentStatus} not in ('verified', 'paid')`,
          ),
        )
        .returning({ id: orders.id });
      if (!ord) {
        throw new AppError(409, 'Trạng thái thanh toán đã đổi — tải lại trang', 'CONFLICT');
      }
      const [row] = await tx
        .insert(paymentProofs)
        .values({ orderId, imageUrl, status: 'proof_uploaded' })
        .returning();

      const [seller] = await tx
        .select({ userId: sellers.userId })
        .from(sellers)
        .where(eq(sellers.id, order.sellerId))
        .limit(1);
      if (seller) {
        await notifyUser(
          tx,
          seller.userId,
          'payment_proof',
          'Khách đã gửi biên lai',
          `Đơn ${order.orderCode} có biên lai chuyển khoản chờ duyệt.`,
          { orderId, orderCode: order.orderCode },
        );
      }
      return row;
    });
    res.status(201).json({ data: proof });
  }),
);

ordersRouter.post(
  '/:id/verify-payment',
  requireAuth,
  requireRole('seller', 'admin'),
  asyncHandler(async (req, res) => {
    const { approved, rejectionReason } = z
      .object({ approved: z.boolean(), rejectionReason: z.string().optional() })
      .parse(req.body);
    const db: Database = req.app.locals.db;
    const id = paramId(req);
    const { order } = await loadOrderForActor(db, id, req.user!);
    await assertSellerApprovedToMutate(db, req.user!);
    if (order.paymentMethod !== 'bank_transfer') {
      throw new AppError(400, 'Đơn này không thanh toán chuyển khoản', 'INVALID_PAYMENT_METHOD');
    }
    const proofs = await db.select({ id: paymentProofs.id }).from(paymentProofs).where(eq(paymentProofs.orderId, id));
    if (!proofs.length) throw new AppError(409, 'Chưa có minh chứng thanh toán', 'NO_PAYMENT_PROOF');

    const actorLabel = req.user!.role === 'admin' ? 'Admin' : 'Quán';
    const updated = await db.transaction(async (tx) => {
      const [ord] = await tx
        .update(orders)
        .set({
          paymentStatus: approved ? 'verified' : 'rejected',
          updatedAt: new Date(),
          version: order.version + 1,
        })
        .where(
          and(
            eq(orders.id, id),
            eq(orders.version, order.version),
            sql`${orders.paymentStatus} not in ('verified', 'paid')`,
          ),
        )
        .returning({ id: orders.id });
      if (!ord) throw new AppError(409, 'Trạng thái thanh toán đã đổi — tải lại trang', 'CONFLICT');
      await tx
        .update(paymentProofs)
        .set({
          status: approved ? 'verified' : 'rejected',
          rejectionReason: approved ? null : rejectionReason,
          reviewedAt: new Date(),
          reviewedBy: req.user!.id,
        })
        .where(eq(paymentProofs.orderId, id));

      await notifyUser(
        tx,
        order.buyerId,
        approved ? 'payment_verified' : 'payment_rejected',
        approved ? 'Đã xác nhận thanh toán' : 'Biên lai bị từ chối',
        approved
          ? `${actorLabel} đã xác nhận chuyển khoản cho đơn ${order.orderCode}.`
          : `${actorLabel} từ chối biên lai đơn ${order.orderCode}${rejectionReason ? `: ${rejectionReason}` : ''}. Vui lòng gửi lại.`,
        { orderId: id, orderCode: order.orderCode },
      );
      return ord;
    });
    void updated;
    res.json({ message: approved ? 'Đã xác nhận thanh toán' : 'Đã từ chối minh chứng' });
  }),
);

ordersRouter.post(
  '/:id/mark-paid',
  requireAuth,
  requireRole('seller', 'admin'),
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    const id = paramId(req);
    const { order } = await loadOrderForActor(db, id, req.user!);
    await assertSellerApprovedToMutate(db, req.user!);
    if (order.paymentMethod !== 'cash') {
      throw new AppError(400, 'Đơn này không thanh toán tiền mặt', 'INVALID_PAYMENT_METHOD');
    }
    const isAdmin = req.user!.role === 'admin';
    if (
      !isAdmin &&
      order.status !== 'delivering' &&
      order.status !== 'returning'
    ) {
      throw new AppError(400, 'Chỉ thu tiền mặt khi đang giao', 'INVALID_STATUS');
    }
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'verified') {
      throw new AppError(409, 'Đơn đã được xác nhận thanh toán', 'ALREADY_PAID');
    }
    const [updated] = await db
      .update(orders)
      .set({ paymentStatus: 'paid', updatedAt: new Date(), version: order.version + 1 })
      .where(
        and(
          eq(orders.id, id),
          eq(orders.version, order.version),
          sql`${orders.paymentStatus} <> 'paid'`,
        ),
      )
      .returning({ id: orders.id });
    if (!updated) throw new AppError(409, 'Trạng thái thanh toán đã đổi — tải lại trang', 'CONFLICT');
    res.json({ message: 'Đã xác nhận thu tiền mặt' });
  }),
);

ordersRouter.post(
  '/:id/review',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const db: Database = req.app.locals.db;
    const orderId = paramId(req);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.buyerId !== req.user!.id || order.status !== 'completed') {
      throw new AppError(400, 'Không thể đánh giá đơn này', 'INVALID_REVIEW');
    }
    try {
      // Chèn review và cộng rating phải cùng thắng hoặc cùng thua, nếu không điểm sẽ lệch.
      const review = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(reviews)
          .values({
            orderId: order.id,
            orderCode: order.orderCode,
            buyerId: req.user!.id,
            sellerId: order.sellerId,
            rating: body.rating,
            comment: body.comment,
            tags: body.tags,
          })
          .returning();
        await bumpSellerRating(tx, order.sellerId, body.rating, 1);
        return row;
      });
      res.status(201).json({ data: review });
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        throw new AppError(409, 'Đơn này đã được đánh giá', 'ALREADY_REVIEWED');
      }
      throw err;
    }
  }),
);

ordersRouter.patch(
  '/:id/review',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const db: Database = req.app.locals.db;
    const orderId = paramId(req);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.buyerId !== req.user!.id || order.status !== 'completed') {
      throw new AppError(400, 'Không thể sửa đánh giá đơn này', 'INVALID_REVIEW');
    }
    const updated = await db.transaction(async (tx) => {
      const [previous] = await tx
        .select({ rating: reviews.rating })
        .from(reviews)
        .where(and(eq(reviews.orderId, order.id), eq(reviews.buyerId, req.user!.id)))
        .for('update')
        .limit(1);
      const [row] = await tx
        .update(reviews)
        .set({
          rating: body.rating,
          ...(body.comment !== undefined ? { comment: body.comment } : {}),
          ...(body.tags !== undefined ? { tags: body.tags } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(reviews.orderId, order.id), eq(reviews.buyerId, req.user!.id)))
        .returning();
      if (!row) throw new AppError(404, 'Chưa có đánh giá để sửa', 'NOT_FOUND');
      await bumpSellerRating(tx, order.sellerId, body.rating - (previous?.rating ?? body.rating), 0);
      return row;
    });
    res.json({ data: updated });
  }),
);

ordersRouter.post(
  '/:id/complaint',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        reason: z.string().min(3),
        description: z.string().min(10),
        evidenceUrls: z.array(z.string()).max(10).optional(),
      })
      .parse(req.body);
    const db = req.app.locals.db;
    const orderId = paramId(req);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.buyerId !== req.user!.id) {
      throw new AppError(403, 'Không có quyền', 'FORBIDDEN');
    }
    const evidenceUrls = assertPrivateProofUrlsForOrder(
      body.evidenceUrls,
      req.user!.id,
      orderId,
      'Ảnh bằng chứng',
    );
    try {
      const [complaint] = await db
        .insert(complaints)
        .values({
          orderId: order.id,
          orderCode: order.orderCode,
          buyerId: req.user!.id,
          sellerId: order.sellerId,
          reason: body.reason,
          description: body.description,
          evidenceUrls: evidenceUrls.length ? evidenceUrls : null,
          status: 'waiting_seller',
        })
        .returning();
      await db.insert(complaintMessages).values({
        complaintId: complaint.id,
        authorId: req.user!.id,
        authorRole: 'buyer',
        body: body.description,
      });
      const [seller] = await db
        .select({ userId: sellers.userId })
        .from(sellers)
        .where(eq(sellers.id, order.sellerId))
        .limit(1);
      if (seller) {
        const preview = body.description.length > 80 ? `${body.description.slice(0, 80)}…` : body.description;
        await notifyUser(
          db,
          seller.userId,
          'complaint_new',
          'Khiếu nại mới từ khách',
          `${body.reason} · ${preview}`,
          { orderId: order.id, complaintId: complaint.id, orderCode: order.orderCode },
        );
      }
      await refreshSellerCounters(db, order.sellerId);
      res.status(201).json({ data: complaint });
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        throw new AppError(409, 'Đơn này đã có khiếu nại', 'ALREADY_COMPLAINED');
      }
      throw err;
    }
  }),
);

ordersRouter.post(
  '/:id/complaint/escalate',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const orderId = paramId(req);
    const db = req.app.locals.db;
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.buyerId !== req.user!.id) {
      throw new AppError(403, 'Không có quyền', 'FORBIDDEN');
    }
    const [complaint] = await db
      .select()
      .from(complaints)
      .where(eq(complaints.orderId, order.id))
      .limit(1);
    if (!complaint) throw new AppError(404, 'Chưa có khiếu nại', 'NOT_FOUND');
    if (complaint.status === 'resolved' || complaint.status === 'rejected') {
      throw new AppError(409, 'Khiếu nại đã kết thúc', 'COMPLAINT_CLOSED');
    }
    const [updated] = await db
      .update(complaints)
      .set({ status: 'new', updatedAt: new Date() })
      .where(eq(complaints.id, complaint.id))
      .returning();
    await db.insert(complaintMessages).values({
      complaintId: complaint.id,
      authorId: req.user!.id,
      authorRole: 'buyer',
      body: 'Người mua gửi khiếu nại lên admin để xử lý.',
    });
    await refreshSellerCounters(db, order.sellerId);
    res.json({ data: updated, message: 'Đã gửi khiếu nại lên admin' });
  }),
);

ordersRouter.post(
  '/:id/complaint/messages',
  ...buyerGuard,
  asyncHandler(async (req, res) => {
    const orderId = paramId(req);
    const { body } = z.object({ body: z.string().min(1) }).parse(req.body);
    const db = req.app.locals.db;
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order || order.buyerId !== req.user!.id) {
      throw new AppError(403, 'Không có quyền', 'FORBIDDEN');
    }
    const [complaint] = await db.select().from(complaints).where(eq(complaints.orderId, orderId)).limit(1);
    if (!complaint) throw new AppError(404, 'Chưa có khiếu nại', 'NOT_FOUND');
    if (complaint.status === 'resolved' || complaint.status === 'rejected') {
      throw new AppError(409, 'Khiếu nại đã đóng', 'COMPLAINT_CLOSED');
    }
    const [message] = await db
      .insert(complaintMessages)
      .values({
        complaintId: complaint.id,
        authorId: req.user!.id,
        authorRole: 'buyer',
        body,
      })
      .returning();
    await db
      .update(complaints)
      .set({ updatedAt: new Date(), status: complaint.status === 'new' ? 'processing' : complaint.status })
      .where(eq(complaints.id, complaint.id));
    const [seller] = await db
      .select({ userId: sellers.userId })
      .from(sellers)
      .where(eq(sellers.id, order.sellerId))
      .limit(1);
    if (seller) {
      const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
      await notifyUser(
        db,
        seller.userId,
        'complaint_message',
        'Tin nhắn khiếu nại mới',
        preview,
        { orderId: order.id, complaintId: complaint.id, orderCode: order.orderCode },
      );
    }
    await refreshSellerCounters(db, order.sellerId);
    res.status(201).json({ data: message });
  }),
);
