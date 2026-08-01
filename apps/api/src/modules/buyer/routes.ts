import { Router } from 'express';
import { z } from 'zod';
import { eq, and, isNull, gte, sql } from 'drizzle-orm';
import { buyerAddresses, profiles, notifications, orders, paymentProofs } from '@langdaihoc/database';
import { profileUpdateSchema, DEMO_MODE } from '@langdaihoc/shared';
import { asyncHandler, AppError } from '../../middleware/error-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { uploadImage, parseImageUpload, safeUploadFileName, imageContentTypeSchema } from '../../lib/storage.js';
import { getFrontendUrl } from '../../lib/env.js';
import { ensurePhoneNotUsed, ensureEmailNotUsed, validateBuyerEmail } from '../auth/service.js';

export const buyerRouter = Router();

buyerRouter.use(requireAuth, requireRole('buyer'));

buyerRouter.get(
  '/addresses',
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.db
      .select()
      .from(buyerAddresses)
      .where(eq(buyerAddresses.userId, req.user!.id));
    res.json({ data });
  }),
);

buyerRouter.post(
  '/addresses',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        recipientName: z.string().min(2),
        phone: z.string().min(9),
        detail: z.string().min(5),
        dormName: z.string().optional(),
        roomNumber: z.string().optional(),
        note: z.string().optional(),
        addressType: z.enum(['dorm', 'rental', 'other']).default('dorm'),
        isDefault: z.boolean().optional(),
      })
      .parse(req.body);

    if (body.isDefault) {
      await req.app.locals.db
        .update(buyerAddresses)
        .set({ isDefault: false })
        .where(eq(buyerAddresses.userId, req.user!.id));
    }

    const [addr] = await req.app.locals.db
      .insert(buyerAddresses)
      .values({ ...body, userId: req.user!.id })
      .returning();
    res.status(201).json({ data: addr });
  }),
);

buyerRouter.patch(
  '/addresses/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        recipientName: z.string().min(2).optional(),
        phone: z.string().min(9).optional(),
        detail: z.string().min(5).optional(),
        dormName: z.string().optional(),
        roomNumber: z.string().optional(),
        note: z.string().optional(),
        addressType: z.enum(['dorm', 'rental', 'other']).optional(),
        isDefault: z.boolean().optional(),
      })
      .parse(req.body);

    if (body.isDefault) {
      await req.app.locals.db
        .update(buyerAddresses)
        .set({ isDefault: false })
        .where(eq(buyerAddresses.userId, req.user!.id));
    }

    const [updated] = await req.app.locals.db
      .update(buyerAddresses)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(buyerAddresses.id, String(req.params.id)), eq(buyerAddresses.userId, req.user!.id)))
      .returning();

    if (!updated) throw new AppError(404, 'Không tìm thấy địa chỉ', 'NOT_FOUND');
    res.json({ data: updated });
  }),
);

buyerRouter.delete(
  '/addresses/:id',
  asyncHandler(async (req, res) => {
    const [deleted] = await req.app.locals.db
      .delete(buyerAddresses)
      .where(and(eq(buyerAddresses.id, String(req.params.id)), eq(buyerAddresses.userId, req.user!.id)))
      .returning();
    if (!deleted) throw new AppError(404, 'Không tìm thấy địa chỉ', 'NOT_FOUND');
    res.json({ message: 'ok' });
  }),
);

buyerRouter.patch(
  '/profile',
  asyncHandler(async (req, res) => {
    const body = profileUpdateSchema.parse(req.body);
    const db = req.app.locals.db;
    const userId = req.user!.id;

    if (body.phone) {
      await ensurePhoneNotUsed(db, body.phone, userId);
    }

    let emailChanged = false;
    let emailVerified = req.user!.emailVerified;

    if (body.email && body.email !== req.user!.email.toLowerCase()) {
      validateBuyerEmail(body.email);
      await ensureEmailNotUsed(db, body.email, userId);

      const supabaseAdmin = req.app.locals.supabaseAdmin;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: body.email,
        email_confirm: DEMO_MODE,
      });
      if (error) {
        throw new AppError(400, error.message || 'Không đổi được email', 'EMAIL_UPDATE_FAILED');
      }

      // Admin update không tự gửi mail xác minh — gửi lại giống flow đăng ký
      // để tránh soft-lock pending_email_verification mà không có link trong hộp thư.
      if (!DEMO_MODE) {
        const frontendUrl = getFrontendUrl();
        const { error: resendError } = await supabaseAdmin.auth.resend({
          type: 'signup',
          email: body.email,
          options: {
            emailRedirectTo: `${frontendUrl}/auth/verify-email`,
          },
        });
        if (resendError) {
          console.error('[buyer] email-change verification mail failed', userId, resendError.message);
        }
      }

      emailChanged = true;
      emailVerified = DEMO_MODE;
    }

    const [updated] = await db
      .update(profiles)
      .set({
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(emailChanged
          ? {
              email: body.email!,
              status: emailVerified ? 'active' : 'pending_email_verification',
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, userId))
      .returning();

    res.json({
      data: updated,
      emailChanged,
      message: emailChanged
        ? DEMO_MODE
          ? 'Đã cập nhật hồ sơ và email'
          : 'Đã đổi email. Vui lòng kiểm tra hộp thư để xác minh email mới.'
        : 'Đã cập nhật hồ sơ',
    });
  }),
);

buyerRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const data = await req.app.locals.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.user!.id))
      .orderBy(notifications.createdAt)
      .limit(50);
    res.json({ data: data.reverse() });
  }),
);

buyerRouter.patch(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    await req.app.locals.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt)));
    res.json({ message: 'ok' });
  }),
);

buyerRouter.patch(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    await req.app.locals.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, String(req.params.id)), eq(notifications.userId, req.user!.id)));
    res.json({ message: 'ok' });
  }),
);

buyerRouter.post(
  '/upload',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        bucket: z.enum(['payment-proofs']),
        contentType: imageContentTypeSchema,
        dataBase64: z.string().min(1),
        fileName: z.string().optional(),
        orderId: z.string().uuid(),
      })
      .parse(req.body);

    const db = req.app.locals.db;
    const [order] = await db
      .select({ id: orders.id, buyerId: orders.buyerId, paymentMethod: orders.paymentMethod })
      .from(orders)
      .where(and(eq(orders.id, body.orderId), eq(orders.buyerId, req.user!.id)))
      .limit(1);
    if (!order) {
      throw new AppError(404, 'Không tìm thấy đơn của bạn', 'NOT_FOUND');
    }
    if (order.paymentMethod !== 'bank_transfer') {
      throw new AppError(400, 'Đơn này không cần biên lai chuyển khoản', 'INVALID_PAYMENT');
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [quota] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentProofs)
      .where(and(eq(paymentProofs.orderId, body.orderId), gte(paymentProofs.uploadedAt, dayAgo)));
    if (Number(quota?.count ?? 0) >= 10) {
      throw new AppError(429, 'Quá số lần upload biên lai trong 24 giờ', 'UPLOAD_QUOTA');
    }

    const { buffer, contentType, ext } = parseImageUpload(body.dataBase64, body.contentType);
    const path = `${req.user!.id}/${body.orderId}/${Date.now()}-${safeUploadFileName(body.fileName ?? 'proof', ext)}`;
    const url = await uploadImage(
      req.app.locals.supabaseAdmin,
      body.bucket,
      path,
      buffer,
      contentType,
    );
    res.json({ data: { url } });
  }),
);
