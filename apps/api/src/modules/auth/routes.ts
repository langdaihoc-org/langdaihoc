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
  verifyRecoverySchema,
  verifyEmailSchema,
  oauthSessionSchema,
  setPasswordSchema,
  changePasswordSchema,
  profileUpdateSchema,
  normalizePhoneVN,
} from '@langdaihoc/shared';
import { profiles, sellers } from '@langdaihoc/database';
import { asyncHandler, AppError } from '../../middleware/error-handler.js';
import { requireAuth, invalidateAuthCache, invalidateAuthCacheForUser } from '../../middleware/auth.js';
import {
  setSessionCookies,
  setRecoveryCookies,
  clearRecoveryCookies,
  clearSessionCookies,
  wantsRememberMe,
} from '../../lib/session.js';
import { assertUploadedImageUrl } from '../../lib/storage.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  RECOVERY_ACCESS_COOKIE,
  RECOVERY_REFRESH_COOKIE,
  createSupabaseAnon,
} from '../../lib/supabase.js';
import { getFrontendUrl } from '../../lib/env.js';
import {
  validateBuyerEmail,
  ensureEmailNotUsed,
  ensurePhoneNotUsed,
  resolveAuthEmail,
  findRegisteredAuthEmail,
  syncProfileStatusOnLogin,
  getSellerByUserId,
  ensureUserRole,
  ensureProfileForOAuthUser,
  authUserHasPassword,
  isAuthEmailVerified,
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
  max: process.env.NODE_ENV === 'production' ? 20 : 200,
  message: { error: { message: 'Quá nhiều yêu cầu, vui lòng thử lại sau', code: 'RATE_LIMIT' } },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 200,
  message: { error: { message: 'Quá nhiều lần đăng nhập, vui lòng thử lại sau', code: 'RATE_LIMIT' } },
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  message: { error: { message: 'Quá nhiều yêu cầu đặt lại mật khẩu', code: 'RATE_LIMIT' } },
});

const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 100,
  message: { error: { message: 'Quá nhiều yêu cầu xác minh liên kết', code: 'RATE_LIMIT' } },
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

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  message: { error: { message: 'Quá nhiều lần đổi mật khẩu, vui lòng thử lại sau', code: 'RATE_LIMIT' } },
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
  hasPassword: boolean,
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
    hasPassword,
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
        status: 'pending_email_verification',
        fullName: input.fullName,
        phone: input.phone ?? null,
      });

      await ensureUserRole(db, userId, 'buyer');
    } catch (e) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
      throw e;
    }

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

    res.status(201).json({
      message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.',
      redirectTo: '/auth/check-email',
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
        status: 'pending_email_verification',
        fullName: input.fullName,
        phone: input.phone,
      });

      // Admin phải bấm duyệt trước khi mở bán.
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

    res.status(201).json({
      message: 'Đăng ký thành công. Vui lòng xác minh email — admin sẽ liên hệ để duyệt cửa hàng.',
      redirectTo: '/auth/check-email',
    });
  }),
);

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const db = req.app.locals.db;
    // Client anon riêng cho từng request — signIn mutate session nội bộ,
    // dùng chung một client sẽ race khi nhiều request đăng nhập song song.
    const supabaseAnon = createSupabaseAnon();

    const email = await resolveAuthEmail(db, input.identifier);
    // Luôn gọi Supabase để tránh timing side-channel (tài khoản có/không tồn tại).
    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: email ?? '__no_such_user__@langdaihoc.invalid',
      password: input.password,
    });

    if (!email) {
      throw new AppError(401, 'Email/SĐT hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS');
    }

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

    const emailVerified = isAuthEmailVerified(data.user);

    // Prod: Auth chưa xác minh → không tạo phiên (Google đã tin cậy qua isAuthEmailVerified).
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
    const user = await buildAuthUserPayload(db, profileForPayload, emailVerified, true);

    res.json({
      user,
      redirectTo: roleHomePath(role),
      requiresEmailVerification: false,
    });
  }),
);

authRouter.post(
  '/oauth/session',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const input = oauthSessionSchema.parse(req.body);
    const db = req.app.locals.db;
    const supabaseAnon = createSupabaseAnon();

    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(input.accessToken);
    if (userErr || !userData.user) {
      throw new AppError(401, 'Phiên Google không hợp lệ hoặc đã hết hạn', 'INVALID_OAUTH_SESSION');
    }

    const authUser = userData.user;
    // Google đã xác minh email — không bắt xác minh riêng trong app.
    const emailVerified = isAuthEmailVerified(authUser);

    const profile = await ensureProfileForOAuthUser(db, authUser);

    if (profile.status === 'deleted') {
      throw new AppError(401, 'Tài khoản không hợp lệ', 'INVALID_CREDENTIALS');
    }
    if (profile.status === 'suspended') {
      throw new AppError(403, 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.', 'SUSPENDED');
    }

    await syncProfileStatusOnLogin(db, authUser.id, emailVerified);

    const [freshProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, authUser.id))
      .limit(1);
    const profileForPayload = freshProfile ?? profile;

    setSessionCookies(
      res,
      {
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
      } as Parameters<typeof setSessionCookies>[1],
      input.rememberMe,
    );

    const role = profileForPayload.role as UserRole;
    const user = await buildAuthUserPayload(
      db,
      profileForPayload,
      emailVerified,
      authUserHasPassword(authUser),
    );

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
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE];
    const supabaseAdmin = req.app.locals.supabaseAdmin;

    if (accessToken) {
      try {
        await supabaseAdmin.auth.admin.signOut(accessToken, 'global');
      } catch {
        /* cookie vẫn xoá bên dưới */
      }
    } else if (refreshToken) {
      // Access hết hạn nhưng refresh còn — cố revoke qua refresh session rồi global signOut.
      try {
        const anon = createSupabaseAnon();
        const { data } = await anon.auth.refreshSession({ refresh_token: refreshToken });
        if (data.session?.access_token) {
          await supabaseAdmin.auth.admin.signOut(data.session.access_token, 'global');
        }
      } catch {
        /* ignore */
      }
    }

    invalidateAuthCache(accessToken, refreshToken);
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

    setSessionCookies(res, data.session, wantsRememberMe(req));
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
      req.user!.hasPassword,
    );

    res.json({ user });
  }),
);

authRouter.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = profileUpdateSchema
      .extend({
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
    invalidateAuthCacheForUser(req.user!.id);
    const user = await buildAuthUserPayload(
      db,
      updated,
      req.user!.emailVerified,
      req.user!.hasPassword,
    );
    res.json({ data: updated, user, message: 'Đã cập nhật hồ sơ' });
  }),
);

authRouter.post(
  '/forgot-password',
  forgotLimiter,
  asyncHandler(async (req, res) => {
    const input = forgotPasswordSchema.parse(req.body);
    const db = req.app.locals.db;
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    const frontendUrl = getFrontendUrl();

    const genericMessage =
      'Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu tới email đăng ký.';

    const email = await findRegisteredAuthEmail(db, input.identifier);
    if (!email) {
      res.json({ message: genericMessage });
      return;
    }

    const mail = await sendPasswordResetEmail(
      supabaseAdmin,
      email,
      `${frontendUrl}/auth/reset-password`,
    );
    if (!mail.ok) {
      console.error('[auth] forgot-password mail failed', mail.error);
      throw new AppError(
        502,
        'Không gửi được email đặt lại mật khẩu. Vui lòng thử lại sau.',
        'MAIL_SEND_FAILED',
      );
    }

    res.json({ message: genericMessage });
  }),
);

authRouter.post(
  '/verify-recovery',
  recoveryLimiter,
  asyncHandler(async (req, res) => {
    const input = verifyRecoverySchema.parse(req.body);
    const supabaseAnon = createSupabaseAnon();
    const recoveryCookie = req.cookies?.[RECOVERY_ACCESS_COOKIE] as string | undefined;

    // StrictMode / reload: token OTP chỉ dùng 1 lần — nếu cookie recovery còn hạn thì OK.
    if (recoveryCookie) {
      const { data: existing } = await supabaseAnon.auth.getUser(recoveryCookie);
      if (existing.user) {
        res.json({ ok: true });
        return;
      }
    }

    const { data, error } = await supabaseAnon.auth.verifyOtp({
      token_hash: input.tokenHash,
      type: 'recovery',
    });

    if (error || !data.session?.access_token) {
      console.error('[auth] verify-recovery failed', {
        tokenLen: input.tokenHash.length,
        err: formatAuthError(error),
        hasSession: Boolean(data.session),
      });
      throw new AppError(
        400,
        'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
        'INVALID_TOKEN',
      );
    }

    setRecoveryCookies(res, data.session);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/verify-email',
  recoveryLimiter,
  asyncHandler(async (req, res) => {
    const input = verifyEmailSchema.parse(req.body);
    const db = req.app.locals.db;
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    const supabaseAnon = createSupabaseAnon();

    // Mail mới: type=magiclink. Mail cũ (lệch): type=signup — thử cả hai.
    const typesToTry =
      input.type === 'magiclink'
        ? (['magiclink', 'signup', 'email'] as const)
        : input.type === 'signup'
          ? (['signup', 'magiclink', 'email'] as const)
          : ([input.type, 'magiclink', 'signup', 'email'] as const);

    let data: Awaited<ReturnType<typeof supabaseAnon.auth.verifyOtp>>['data'] | null = null;
    let error: Awaited<ReturnType<typeof supabaseAnon.auth.verifyOtp>>['error'] | null = null;

    for (const otpType of typesToTry) {
      const result = await supabaseAnon.auth.verifyOtp({
        token_hash: input.tokenHash,
        type: otpType,
      });
      data = result.data;
      error = result.error;
      if (!error && data.user?.id) break;
    }

    if (error || !data?.user?.id) {
      console.error('[auth] verify-email failed', {
        type: input.type,
        tried: typesToTry,
        tokenLen: input.tokenHash.length,
        err: formatAuthError(error),
      });
      throw new AppError(
        400,
        'Liên kết xác minh không hợp lệ hoặc đã hết hạn',
        'INVALID_TOKEN',
      );
    }

    await syncProfileStatusOnLogin(db, data.user.id, true);

    // Thu hồi session ngay — link xác minh không được dùng như đăng nhập không mật khẩu.
    if (data.session?.access_token) {
      await supabaseAdmin.auth.admin.signOut(data.session.access_token, 'global').catch(() => undefined);
    }
    clearSessionCookies(res);

    res.json({
      ok: true,
      message: 'Email đã được xác minh. Vui lòng đăng nhập để tiếp tục.',
      redirectTo: '/auth/login?verified=1',
    });
  }),
);

authRouter.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = resetPasswordSchema.parse(req.body);
    const accessToken = req.cookies?.[RECOVERY_ACCESS_COOKIE] as string | undefined;
    const refreshToken = (req.cookies?.[RECOVERY_REFRESH_COOKIE] as string | undefined) ?? '';

    if (!accessToken) {
      throw new AppError(400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 'INVALID_TOKEN');
    }

    const supabaseAnon = createSupabaseAnon();
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    const { data: userData, error: userError } = await supabaseAnon.auth.getUser(accessToken);
    if (userError || !userData.user) {
      clearRecoveryCookies(res);
      throw new AppError(400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 'INVALID_TOKEN');
    }

    const { error: sessionError } = await supabaseAnon.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) {
      clearRecoveryCookies(res);
      throw new AppError(400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 'INVALID_TOKEN');
    }

    const { error } = await supabaseAnon.auth.updateUser({ password: input.password });
    if (error) {
      throw new AppError(400, 'Không đặt lại được mật khẩu', 'RESET_FAILED');
    }

    // Thu hồi mọi phiên cũ (kể cả thiết bị khác) sau khi đổi mật khẩu.
    await supabaseAdmin.auth.admin.signOut(accessToken, 'global').catch(() => undefined);
    await supabaseAnon.auth.signOut().catch(() => undefined);
    clearRecoveryCookies(res);
    // Phòng trường hợp trình duyệt còn phiên đăng nhập thường cũ trên cùng máy.
    clearSessionCookies(res);

    res.json({
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.',
      redirectTo: '/auth/login',
    });
  }),
);

/** Tài khoản Google chưa có mật khẩu — đặt lần đầu, không hỏi mật khẩu cũ. */
authRouter.post(
  '/set-password',
  requireAuth,
  changePasswordLimiter,
  asyncHandler(async (req, res) => {
    if (req.user!.hasPassword) {
      throw new AppError(
        400,
        'Tài khoản đã có mật khẩu. Hãy dùng chức năng đổi mật khẩu.',
        'PASSWORD_ALREADY_SET',
      );
    }

    const input = setPasswordSchema.parse(req.body);
    const supabaseAdmin = req.app.locals.supabaseAdmin;
    const accessToken = req.cookies[ACCESS_TOKEN_COOKIE];

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user!.id, {
      password: input.newPassword,
    });
    if (error) {
      throw new AppError(400, 'Không tạo được mật khẩu', 'SET_PASSWORD_FAILED');
    }

    if (accessToken) {
      await supabaseAdmin.auth.admin.signOut(accessToken, 'others').catch(() => undefined);
    }

    res.json({ message: 'Đã tạo mật khẩu. Từ giờ bạn có thể đăng nhập bằng email và mật khẩu.' });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  changePasswordLimiter,
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
    const email = await findRegisteredAuthEmail(db, identifier);
    if (email) {
      const frontendUrl = getFrontendUrl();
      const mail = await resendSignupConfirmation(
        supabaseAdmin,
        email,
        `${frontendUrl}/auth/verify-email`,
      );
      if (!mail.ok) {
        console.error('[auth] resend-verification failed', mail.error);
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
