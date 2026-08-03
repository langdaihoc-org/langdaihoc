import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  buyerRegisterSchema,
  sellerRegisterSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  DEMO_MODE,
  normalizePhoneVN,
} from '@langdaihoc/shared';
import { profiles, sellers } from '@langdaihoc/database';
import { asyncHandler, AppError } from '../../middleware/error-handler.js';
import { requireAuth } from '../../middleware/auth.js';
import { setSessionCookies, clearSessionCookies } from '../../lib/session.js';
import { assertUploadedImageUrl } from '../../lib/storage.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  createSupabaseAnon,
} from '../../lib/supabase.js';
import { getFrontendUrl } from '../../lib/env.js';
import {
  validateBuyerEmail,
  ensureEmailNotUsed,
  ensurePhoneNotUsed,
  resolveAuthEmail,
  syncProfileStatusOnLogin,
  getSellerByUserId,
  ensureUserRole,
  roleHomePath,
  createAuthUserForRegister,
  sendSignupVerificationEmail,
  sendPasswordResetEmail,
  resendSignupConfirmation,
  formatAuthError,
} from './service.js';
import type { UserRole } from '@langdaihoc/shared';
import type { Database } from '@langdaihoc/database';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Local/QA chạy nhiều smoke login — production vẫn 20/15 phút
  max: process.env.NODE_ENV === 'production' ? 20 : 200,
  message: { error: { message: 'Quá nhiều yêu cầu, vui lòng thử lại sau', code: 'RATE_LIMIT' } },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 120 : 500,
  message: { error: { message: 'Quá nhiều yêu cầu, vui lòng thử lại sau', code: 'RATE_LIMIT' } },
});

const resendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: { message: 'Đã vượt giới hạn gửi lại email', code: 'RATE_LIMIT' } },
});

export const authRouter = Router();

async function buildAuthUserPayload(
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
  emailVerified: boolean,
) {
  const role = profile.role as UserRole;
  const seller = role === 'seller' ? await getSellerByUserId(db, profile.id) : null;
  return {
    id: profile.id,
    email: profile.email,
    phone: profile.phone ?? null,
    role,
    // Trả status theo DB — không ép 'active' khi hồ sơ đang chờ xác minh email
    // (ví dụ sau khi đổi email), để UI khớp với requireActiveBuyer phía API.
    status: profile.status,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl ?? null,
    emailVerified,
    sellerStatus: seller?.status ?? null,
    shopName: seller?.shopName ?? null,
  };
}

authRouter.post(
  '/register/buyer',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = buyerRegisterSchema.parse(req.body);
    const db = req.app.locals.db;
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    const frontendUrl = getFrontendUrl();

    await ensureEmailNotUsed(db, input.email);
    validateBuyerEmail(input.email);
    if (input.phone) await ensurePhoneNotUsed(db, input.phone);

    const { userId } = await createAuthUserForRegister({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      role: 'buyer',
      emailRedirectTo: `${frontendUrl}/auth/verify-email`,
      supabaseAdmin,
    });

    try {
      await db.insert(profiles).values({
        id: userId,
        email: input.email,
        role: 'buyer',
        status: DEMO_MODE ? 'active' : 'pending_email_verification',
        fullName: input.fullName,
        phone: input.phone ?? null,
      });

      await ensureUserRole(db, userId, 'buyer');
    } catch (e) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
      throw e;
    }

    if (!DEMO_MODE) {
      const mail = await sendSignupVerificationEmail(
        supabaseAdmin,
        input.email,
        `${frontendUrl}/auth/verify-email`,
      );
      if (!mail.ok) {
        console.error('[auth] buyer register mail failed', input.email, mail.error);
        res.status(201).json({
          message:
            'Đăng ký thành công nhưng gửi email xác minh thất bại. Vui lòng dùng "Gửi lại email xác minh".',
          redirectTo: '/auth/check-email',
          emailSendFailed: true,
        });
        return;
      }
    }

    res.status(201).json({
      message: DEMO_MODE
        ? 'Đăng ký thành công. Bạn có thể đăng nhập ngay.'
        : 'Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.',
      redirectTo: DEMO_MODE ? '/auth/login' : '/auth/check-email',
    });
  }),
);

authRouter.post(
  '/register/seller',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = sellerRegisterSchema.parse(req.body);
    const db = req.app.locals.db;
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    const frontendUrl = getFrontendUrl();

    await ensureEmailNotUsed(db, input.email);
    await ensurePhoneNotUsed(db, input.phone);

    const { userId } = await createAuthUserForRegister({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      role: 'seller',
      emailRedirectTo: `${frontendUrl}/auth/verify-email`,
      supabaseAdmin,
    });

    try {
      await db.insert(profiles).values({
        id: userId,
        email: input.email,
        role: 'seller',
        status: DEMO_MODE ? 'active' : 'pending_email_verification',
        fullName: input.fullName,
        phone: input.phone,
      });

      // Luôn pending — kể cả DEMO: admin phải bấm duyệt trước khi mở bán.
      await db.insert(sellers).values({
        userId,
        shopName: `${input.fullName} — chờ duyệt`,
        serviceTypes: input.intendedService,
        businessAddress: `Liên hệ: ${input.phone}`,
        description: input.contactNote?.trim()
          ? input.contactNote.trim()
          : `Đăng ký bán ${input.intendedService === 'food' ? 'ăn uống' : 'giặt đồ'} — chờ admin liên hệ`,
        status: 'pending',
        approvedAt: null,
      });

      await ensureUserRole(db, userId, 'seller');
    } catch (e) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
      throw e;
    }

    if (!DEMO_MODE) {
      const mail = await sendSignupVerificationEmail(
        supabaseAdmin,
        input.email,
        `${frontendUrl}/auth/verify-email`,
      );
      if (!mail.ok) {
        console.error('[auth] seller register mail failed', input.email, mail.error);
        res.status(201).json({
          message:
            'Đăng ký thành công nhưng gửi email xác minh thất bại. Vui lòng dùng "Gửi lại email xác minh".',
          redirectTo: '/auth/check-email',
          emailSendFailed: true,
        });
        return;
      }
    }

    res.status(201).json({
      message: DEMO_MODE
        ? 'Đăng ký đối tác thành công. Bạn có thể đăng nhập — cửa hàng chờ admin duyệt.'
        : 'Đăng ký thành công. Vui lòng xác minh email — admin sẽ liên hệ để duyệt cửa hàng.',
      redirectTo: DEMO_MODE ? '/auth/login' : '/auth/check-email',
    });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const db = req.app.locals.db;
    // Client anon riêng cho từng request — signIn mutate session nội bộ,
    // dùng chung một client sẽ race khi nhiều request đăng nhập song song.
    const supabaseAnon = createSupabaseAnon();

    const email = await resolveAuthEmail(db, input.identifier);
    if (!email) {
      throw new AppError(401, 'Email/SĐT hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS');
    }

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email,
      password: input.password,
    });

    // Supabase (Confirm email bật): chưa xác minh → lỗi riêng, không nhầm “sai mật khẩu”.
    const authErrMsg = (error?.message ?? '').toLowerCase();
    if (
      error &&
      (authErrMsg.includes('email not confirmed') ||
        authErrMsg.includes('email_not_confirmed') ||
        error.code === 'email_not_confirmed')
    ) {
      throw new AppError(
        403,
        'Email chưa được xác minh. Vui lòng kiểm tra hộp thư (và spam) rồi bấm liên kết xác minh.',
        'EMAIL_NOT_VERIFIED',
      );
    }

    if (error || !data.session || !data.user) {
      throw new AppError(401, 'Email/SĐT hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS');
    }

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, data.user.id))
      .limit(1);

    if (!profile || profile.status === 'deleted') {
      throw new AppError(401, 'Email/SĐT hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS');
    }

    if (profile.status === 'suspended') {
      throw new AppError(403, 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.', 'SUSPENDED');
    }

    const emailVerified = Boolean(data.user.email_confirmed_at) || DEMO_MODE;

    // Prod: Auth chưa xác minh → không tạo phiên.
    if (!emailVerified) {
      const supabaseAdmin = req.app.locals.supabaseAdmin;
      await supabaseAdmin.auth.admin.signOut(data.session.access_token, 'global').catch(() => undefined);
      clearSessionCookies(res);
      throw new AppError(
        403,
        'Email chưa được xác minh. Vui lòng kiểm tra hộp thư (và spam) rồi bấm liên kết xác minh.',
        'EMAIL_NOT_VERIFIED',
      );
    }

    // Đã xác minh Auth — đồng bộ profile pending → active nếu cần.
    await syncProfileStatusOnLogin(db, data.user.id, emailVerified);

    // sync có thể đã nâng status pending → active; đọc lại để payload khớp DB
    const [freshProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, data.user.id))
      .limit(1);
    const profileForPayload = freshProfile ?? profile;

    setSessionCookies(res, data.session, input.rememberMe);

    const role = profileForPayload.role as UserRole;
    const user = await buildAuthUserPayload(db, profileForPayload, emailVerified);

    res.json({
      user,
      redirectTo: roleHomePath(role),
      requiresEmailVerification: false,
    });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const accessToken = req.cookies[ACCESS_TOKEN_COOKIE];
    const supabaseAdmin = req.app.locals.supabaseAdmin;

    if (accessToken) {
      try {
        await supabaseAdmin.auth.admin.signOut(accessToken, 'global');
      } catch {
        /* cookie vẫn xoá bên dưới */
      }
    }

    clearSessionCookies(res);
    res.json({ message: 'Đã đăng xuất' });
  }),
);

authRouter.post(
  '/refresh',
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw new AppError(401, 'Phiên đăng nhập hết hạn', 'SESSION_EXPIRED');
    }

    const supabaseAnon = createSupabaseAnon();
    const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      clearSessionCookies(res);
      throw new AppError(401, 'Phiên đăng nhập hết hạn', 'SESSION_EXPIRED');
    }

    setSessionCookies(res, data.session);
    res.json({ message: 'Phiên đăng nhập đã được gia hạn' });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = req.app.locals.db;
    // requireAuth đã load + sync profile — không select lại
    const user = await buildAuthUserPayload(
      db,
      {
        id: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
        status: req.user!.status,
        fullName: req.user!.fullName,
        phone: req.user!.phone,
        avatarUrl: req.user!.avatarUrl,
      },
      req.user!.emailVerified,
    );

    res.json({ user });
  }),
);

authRouter.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        fullName: z.string().trim().min(2).max(100).optional(),
        phone: z.string().trim().min(8).max(20).nullable().optional(),
        avatarUrl: z.string().url().nullable().optional(),
      })
      .parse(req.body);
    const db = req.app.locals.db;
    if (body.phone) await ensurePhoneNotUsed(db, body.phone, req.user!.id);
    const avatarUrl =
      body.avatarUrl !== undefined ? assertUploadedImageUrl(body.avatarUrl, 'Ảnh đại diện') : undefined;
    const [updated] = await db
      .update(profiles)
      .set({
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, req.user!.id))
      .returning();
    if (!updated) throw new AppError(404, 'Không tìm thấy hồ sơ', 'NOT_FOUND');
    const user = await buildAuthUserPayload(db, updated, req.user!.emailVerified);
    res.json({ data: updated, user, message: 'Đã cập nhật hồ sơ' });
  }),
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = forgotPasswordSchema.parse(req.body);
    const db = req.app.locals.db;
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    const frontendUrl = getFrontendUrl();
    const notice =
      'Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu tới email của bạn hoặc tài khoản chưa được tạo.';

    const email = await resolveAuthEmail(db, input.identifier);
    if (email) {
      const mail = await sendPasswordResetEmail(
        supabaseAdmin,
        email,
        `${frontendUrl}/auth/reset-password`,
      );
      if (!mail.ok) {
        console.error('[auth] forgot-password mail failed', email, mail.error);
      }
    }

    res.json({ message: notice });
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    const accessToken = req.body.accessToken as string | undefined;

    if (!accessToken) {
      throw new AppError(400, 'Token không hợp lệ', 'INVALID_TOKEN');
    }

    const supabaseAnon = createSupabaseAnon();
    const { error: sessionError } = await supabaseAnon.auth.setSession({
      access_token: accessToken,
      refresh_token: req.body.refreshToken ?? '',
    });

    if (sessionError) {
      throw new AppError(400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 'INVALID_TOKEN');
    }

    const { error } = await supabaseAnon.auth.updateUser({ password: input.password });
    if (error) {
      throw new AppError(400, 'Không đặt lại được mật khẩu', 'RESET_FAILED');
    }

    await supabaseAnon.auth.signOut();
    clearSessionCookies(res);

    res.json({
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.',
      redirectTo: '/auth/login',
    });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    const accessToken = req.cookies[ACCESS_TOKEN_COOKIE];

    const { error: signInError } = await createSupabaseAnon().auth.signInWithPassword({
      email: req.user!.email,
      password: input.currentPassword,
    });

    if (signInError) {
      throw new AppError(400, 'Mật khẩu hiện tại không đúng', 'WRONG_PASSWORD');
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user!.id, {
      password: input.newPassword,
    });

    if (error) {
      throw new AppError(400, 'Không đổi được mật khẩu', 'CHANGE_FAILED');
    }

    if (accessToken) {
      await supabaseAdmin.auth.admin.signOut(accessToken, 'others');
    }

    res.json({ message: 'Đổi mật khẩu thành công' });
  }),
);

authRouter.post(
  '/resend-verification',
  resendLimiter,
  asyncHandler(async (req, res) => {
    const raw = String(
      (req.body.identifier as string | undefined) ??
        (req.body.email as string | undefined) ??
        '',
    ).trim();
    if (!raw) {
      throw new AppError(400, 'Vui lòng nhập email hoặc số điện thoại', 'VALIDATION_ERROR');
    }

    const db = req.app.locals.db;
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    const identifier = raw.includes('@') ? raw.toLowerCase() : normalizePhoneVN(raw) || raw;
    const email = await resolveAuthEmail(db, identifier);
    if (email) {
      const frontendUrl = getFrontendUrl();
      const mail = await resendSignupConfirmation(
        supabaseAdmin,
        email,
        `${frontendUrl}/auth/verify-email`,
      );
      if (!mail.ok) {
        console.error('[auth] resend-verification failed', email, mail.error);
      }
    }

    res.json({ message: 'Nếu tài khoản tồn tại, email xác minh đã được gửi lại.' });
  }),
);

authRouter.get(
  '/verify-callback',
  asyncHandler(async (req, res) => {
    const frontendUrl = getFrontendUrl();
    res.redirect(`${frontendUrl}/auth/login?verified=1`);
  }),
);
