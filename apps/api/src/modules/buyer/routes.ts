import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { eq, and, isNull, gte, sql, desc } from 'drizzle-orm';
import { buyerAddresses, profiles, notifications, orders, paymentProofs } from '@langdaihoc/database';
import type { Database } from '@langdaihoc/database';
import { profileUpdateSchema, type UserRole } from '@langdaihoc/shared';
import { asyncHandler, AppError } from '../../middleware/error-handler.js';
import {
  requireAuth,
  requireRole,
  requireActiveBuyer,
  invalidateAuthCacheForUser,
  primeAuthCache,
  type AuthUser,
} from '../../middleware/auth.js';
import { ACCESS_TOKEN_COOKIE } from '../../lib/supabase.js';
import { uploadImage, parseImageUpload, safeUploadFileName, imageContentTypeSchema } from '../../lib/storage.js';
import { getFrontendUrl } from '../../lib/env.js';
import { createSupabaseAnon } from '../../lib/supabase.js';
import { ensurePhoneNotUsed, ensureEmailNotUsed, validateBuyerEmail, getSellerByUserId } from '../auth/service.js';
import { clearUnreadForUser, decrementUnreadForUser } from '../../services/counters.js';

export const buyerRouter = Router();

buyerRouter.use(requireAuth, requireRole('buyer'));

async function buyerAuthUserFromProfile(
  db: Database,
  profile: {
    id: string;
    email: string;
    role: string;
    status: string;
    fullName: string;
    phone?: string | null;
    avatarUrl?: string | null;
  },
  opts: { emailVerified: boolean; hasPassword: boolean },
) {
  const role = profile.role as UserRole;
  const seller = role === 'seller' ? await getSellerByUserId(db, profile.id) : null;
  const authUser: AuthUser = {
    id: profile.id,
    email: profile.email,
    phone: profile.phone ?? null,
    role,
    status: profile.status,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl ?? null,
    emailVerified: opts.emailVerified,
    hasPassword: opts.hasPassword,
  };
  return {
    ...authUser,
    sellerStatus: seller?.status ?? null,
    shopName: seller?.shopName ?? null,
  };
}

/** Upload ảnh biên lai/bằng chứng — 20 lần/5 phút/IP (prod) */
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
});

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

    let emailVerified = req.user!.emailVerified;

    if (body.email && body.email !== req.user!.email.toLowerCase()) {
      if (!body.currentPassword) {
        throw new AppError(400, 'Nhập mật khẩu hiện tại để đổi email', 'PASSWORD_REQUIRED');
      }
      validateBuyerEmail(body.email);
      await ensureEmailNotUsed(db, body.email, userId);

      const { error: signInError } = await createSupabaseAnon().auth.signInWithPassword({
        email: req.user!.email,
        password: body.currentPassword,
      });
      if (signInError) {
        throw new AppError(400, 'Mật khẩu hiện tại không đúng', 'WRONG_PASSWORD');
      }

      const supabaseAdmin = req.app.locals.supabaseAdmin;
      const oldEmail = req.user!.email;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: body.email,
        email_confirm: false,
      });
      if (error) {
        throw new AppError(400, error.message || 'Không đổi được email', 'EMAIL_UPDATE_FAILED');
      }

      const rollbackAuthEmail = async () => {
        await supabaseAdmin.auth.admin
          .updateUserById(userId, { email: oldEmail, email_confirm: true })
          .catch((e: unknown) => console.error('[buyer] rollback email failed', userId, e));
      };

      const frontendUrl = getFrontendUrl();
      const { error: resendError } = await supabaseAdmin.auth.resend({
        type: 'signup',
        email: body.email,
        options: {
          emailRedirectTo: `${frontendUrl}/auth/verify-email`,
        },
      });
      if (resendError) {
        await rollbackAuthEmail();
        throw new AppError(
          502,
          'Không gửi được email xác minh. Email chưa đổi — thử lại sau.',
          'EMAIL_SEND_FAILED',
        );
      }

      emailVerified = false;

      try {
        const [updatedEmail] = await db
          .update(profiles)
          .set({
            ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
            ...(body.phone !== undefined ? { phone: body.phone } : {}),
            email: body.email!,
            status: 'pending_email_verification',
            updatedAt: new Date(),
          })
          .where(eq(profiles.id, userId))
          .returning();
        if (!updatedEmail) {
          await rollbackAuthEmail();
          throw new AppError(500, 'Không cập nhật được hồ sơ', 'PROFILE_UPDATE_FAILED');
        }
        invalidateAuthCacheForUser(userId);
        const user = await buyerAuthUserFromProfile(db, updatedEmail, {
          emailVerified: false,
          hasPassword: req.user!.hasPassword,
        });
        primeAuthCache(req.cookies[ACCESS_TOKEN_COOKIE], user);
        res.json({
          data: updatedEmail,
          user,
          emailChanged: true,
          message: 'Đã đổi email. Vui lòng kiểm tra hộp thư để xác minh email mới.',
        });
        return;
      } catch (err) {
        if (!(err instanceof AppError)) await rollbackAuthEmail();
        throw err;
      }
    }

    const [updated] = await db
      .update(profiles)
      .set({
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, userId))
      .returning();

    if (!updated) {
      throw new AppError(500, 'Không cập nhật được hồ sơ', 'PROFILE_UPDATE_FAILED');
    }

    invalidateAuthCacheForUser(userId);
    const user = await buyerAuthUserFromProfile(db, updated, {
      emailVerified: req.user!.emailVerified,
      hasPassword: req.user!.hasPassword,
    });
    primeAuthCache(req.cookies[ACCESS_TOKEN_COOKIE], user);

    res.json({
      data: updated,
      user,
      emailChanged: false,
      message: 'Đã cập nhật hồ sơ',
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
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    res.json({ data });
  }),
);

buyerRouter.patch(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    const db: Database = req.app.locals.db;
    await db.transaction(async (tx) => {
      await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt)));
      await clearUnreadForUser(tx, req.user!.id);
    });
    res.json({ message: 'ok' });
  }),
);

buyerRouter.patch(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    const db: Database = req.app.locals.db;
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, String(req.params.id)),
            eq(notifications.userId, req.user!.id),
            isNull(notifications.readAt),
          ),
        )
        .returning({ id: notifications.id });
      if (updated) await decrementUnreadForUser(tx, req.user!.id);
    });
    res.json({ message: 'ok' });
  }),
);

buyerRouter.post(
  '/upload',
  uploadLimiter,
  requireActiveBuyer,
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
    // Endpoint dùng chung cho biên lai CK lẫn ảnh bằng chứng khiếu nại (mọi phương thức
    // thanh toán) — không chặn theo paymentMethod ở đây; endpoint tạo biên lai riêng
    // (`POST /orders/:id/payment-proof`) đã tự kiểm tra bank_transfer.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [quota] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(paymentProofs)
      .where(and(eq(paymentProofs.orderId, body.orderId), gte(paymentProofs.uploadedAt, dayAgo)));
    if (Number(quota?.count ?? 0) >= 20) {
      throw new AppError(429, 'Quá số lần upload ảnh trong 24 giờ', 'UPLOAD_QUOTA');
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
