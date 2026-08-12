import type { Request, Response, NextFunction } from 'express';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { UserRole } from '@langdaihoc/shared';
import { eq } from 'drizzle-orm';
import { profiles } from '@langdaihoc/database';
import {
  createSupabaseAnon,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../lib/supabase.js';
import { setSessionCookies, wantsRememberMe, clearSessionCookies } from '../lib/session.js';
import { AppError } from './error-handler.js';
import { syncProfileStatusOnLogin, authUserHasPassword, isAuthEmailVerified } from '../modules/auth/service.js';
import { verifyJwtLocally, type LocalJwtPayload } from '../lib/jwt-verify.js';

let supabaseAnon: ReturnType<typeof createSupabaseAnon> | null = null;
function getSupabaseAnon() {
  if (!supabaseAnon) supabaseAnon = createSupabaseAnon();
  return supabaseAnon;
}

export interface AuthUser {
  id: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  status: string;
  fullName: string;
  avatarUrl?: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Cache phiên đã xác thực theo access token.
 *
 * FE poll `/orders/pulse` mỗi 5–30s; nếu không cache thì mỗi lần poll tốn một
 * HTTP round-trip sang Supabase Auth cộng một query profiles, và đó mới là phần
 * đắt nhất của request chứ không phải truy vấn counter.
 *
 * TTL ngắn nên khoá/xoá tài khoản trễ nhất là `AUTH_CACHE_TTL_MS` mới có hiệu lực.
 */
const AUTH_CACHE_TTL_MS = Math.max(0, Number(process.env.AUTH_CACHE_TTL_MS ?? 30_000) || 0);
const AUTH_CACHE_MAX = 10_000;
const authCache = new Map<string, { user: AuthUser; expiresAt: number }>();

/**
 * Đọc `exp` từ payload JWT mà KHÔNG xác minh chữ ký — chỉ dùng để rút ngắn thời
 * gian cache, không bao giờ dùng để cấp quyền. Token vào cache đều đã được
 * Supabase xác minh trước đó.
 */
function jwtExpiryMs(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function sweepAuthCache() {
  const now = Date.now();
  for (const [token, entry] of authCache) {
    if (entry.expiresAt <= now) authCache.delete(token);
  }
  if (authCache.size >= AUTH_CACHE_MAX) authCache.clear();
}

function readAuthCache(token: string): AuthUser | null {
  const entry = authCache.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    authCache.delete(token);
    return null;
  }
  return entry.user;
}

function writeAuthCache(token: string, user: AuthUser) {
  if (AUTH_CACHE_TTL_MS === 0) return;
  const tokenExpiry = jwtExpiryMs(token) ?? Number.POSITIVE_INFINITY;
  const expiresAt = Math.min(Date.now() + AUTH_CACHE_TTL_MS, tokenExpiry);
  if (expiresAt <= Date.now()) return;
  if (authCache.size >= AUTH_CACHE_MAX) sweepAuthCache();
  authCache.set(token, { user, expiresAt });
}

/** Gọi khi logout / đổi mật khẩu để phiên cũ không sống thêm hết TTL. */
export function invalidateAuthCache(...tokens: (string | null | undefined)[]) {
  for (const token of tokens) {
    if (token) authCache.delete(token);
  }
}

/** Khoá/xoá tài khoản: admin không cầm token của user nên phải quét theo id. */
export function invalidateAuthCacheForUser(userId: string) {
  for (const [token, entry] of authCache) {
    if (entry.user.id === userId) authCache.delete(token);
  }
}

/** Token client gửi lên, chưa xác minh — chỉ dùng để tra cache. */
function presentedAccessToken(req: Request): string | null {
  const rawAuth = req.headers.authorization;
  const bearer =
    rawAuth && /^Bearer\s+/i.test(rawAuth) ? rawAuth.replace(/^Bearer\s+/i, '').trim() : undefined;
  return (req.cookies[ACCESS_TOKEN_COOKIE] as string | undefined) ?? bearer ?? null;
}

type ResolvedSession =
  | { token: string; supabaseUser: SupabaseUser; jwtPayload: null }
  | { token: string; supabaseUser: null; jwtPayload: LocalJwtPayload };

/**
 * Xác minh access token, tự gia hạn bằng refresh cookie khi hết hạn.
 * Trả luôn user đã xác minh để caller không phải gọi `getUser` lần nữa.
 */
async function resolveSession(req: Request, res: Response): Promise<ResolvedSession | null> {
  const accessToken = presentedAccessToken(req);
  const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE] as string | undefined;

  if (accessToken) {
    try {
      const payload = await verifyJwtLocally(accessToken);
      if (payload?.sub) {
        return { token: accessToken, supabaseUser: null, jwtPayload: payload };
      }
      // payload null = het han — thu refresh ben duoi
    } catch {
      // JWKS khong lay duoc fallback sang remote getUser
      const { data, error } = await getSupabaseAnon().auth.getUser(accessToken);
      if (!error && data.user) {
        return { token: accessToken, supabaseUser: data.user, jwtPayload: null };
      }
    }
  }

  // Access het han / thieu — gia han bang refresh cookie
  if (!refreshToken) return null;

  const { data, error } = await getSupabaseAnon().auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session?.access_token || !data.user) {
    clearSessionCookies(res);
    return null;
  }

  setSessionCookies(res, data.session, wantsRememberMe(req));
  return { token: data.session.access_token, supabaseUser: data.user, jwtPayload: null };
}

async function loadAuthUser(
  db: Request['app']['locals']['db'],
  session: ResolvedSession,
): Promise<AuthUser> {
  const userId = session.supabaseUser?.id ?? session.jwtPayload!.sub;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);

  if (!profile || profile.status === 'deleted') {
    throw new AppError(401, 'Tai khoan khong ton tai', 'UNAUTHORIZED');
  }
  if (profile.status === 'suspended') {
    throw new AppError(403, 'Tai khoan da bi khoa. Vui long lien he ho tro.', 'SUSPENDED');
  }

  const emailVerified = session.supabaseUser
    ? isAuthEmailVerified(session.supabaseUser)
    : isAuthEmailVerified(session.jwtPayload!);
  let status = profile.status;
  if (emailVerified && status === 'pending_email_verification') {
    await syncProfileStatusOnLogin(db, profile.id, emailVerified);
    status = 'active';
  }

  const hasPassword = session.supabaseUser
    ? authUserHasPassword(session.supabaseUser)
    : (() => {
        const providers = session.jwtPayload!.app_metadata?.providers;
        if (Array.isArray(providers)) return providers.includes('email');
        return session.jwtPayload!.app_metadata?.provider === 'email';
      })();

  return {
    id: profile.id,
    email: profile.email,
    phone: profile.phone ?? null,
    role: profile.role as UserRole,
    status,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl ?? null,
    emailVerified,
    hasPassword,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const presented = presentedAccessToken(req);
    if (presented) {
      const cached = readAuthCache(presented);
      if (cached) {
        req.user = cached;
        next();
        return;
      }
    }

    const session = await resolveSession(req, res);
    if (!session) {
      throw new AppError(401, 'Bạn cần đăng nhập', 'UNAUTHORIZED');
    }

    const user = await loadAuthUser(req.app.locals.db, session);
    writeAuthCache(session.token, user);
    req.user = user;

    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError(403, 'Bạn không có quyền truy cập', 'FORBIDDEN'));
      return;
    }
    next();
  };
}

export function requireActiveBuyer(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    next(new AppError(401, 'Bạn cần đăng nhập', 'UNAUTHORIZED'));
    return;
  }

  if (req.user.role !== 'buyer') {
    next(new AppError(403, 'Chỉ dành cho người mua', 'FORBIDDEN'));
    return;
  }

  if (!req.user.emailVerified || req.user.status !== 'active') {
    next(
      new AppError(
        403,
        'Vui lòng xác minh email trước khi sử dụng dịch vụ',
        'EMAIL_NOT_VERIFIED',
      ),
    );
    return;
  }

  next();
}

/** Gắn req.user nếu có phiên — không bắt buộc đăng nhập. */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const presented = presentedAccessToken(req);
    if (presented) {
      const cached = readAuthCache(presented);
      if (cached) {
        req.user = cached;
        next();
        return;
      }
    }

    const session = await resolveSession(req, res);
    if (!session) {
      next();
      return;
    }

    const user = await loadAuthUser(req.app.locals.db, session);
    writeAuthCache(session.token, user);
    req.user = user;
    next();
  } catch {
    next();
  }
}
