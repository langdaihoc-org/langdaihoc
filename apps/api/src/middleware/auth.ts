import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@langdaihoc/shared';
import { eq } from 'drizzle-orm';
import { profiles } from '@langdaihoc/database';
import { DEMO_MODE } from '@langdaihoc/shared';
import { createSupabaseAnon, ACCESS_TOKEN_COOKIE } from '../lib/supabase.js';
import { AppError } from './error-handler.js';
import { syncProfileStatusOnLogin } from '../modules/auth/service.js';

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
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const rawAuth = req.headers.authorization;
    const bearer =
      rawAuth && /^Bearer\s+/i.test(rawAuth) ? rawAuth.replace(/^Bearer\s+/i, '').trim() : undefined;
    const accessToken = req.cookies[ACCESS_TOKEN_COOKIE] ?? bearer;

    if (!accessToken) {
      throw new AppError(401, 'Bạn cần đăng nhập', 'UNAUTHORIZED');
    }

    const { data, error } = await getSupabaseAnon().auth.getUser(accessToken);

    if (error || !data.user) {
      throw new AppError(401, 'Phiên đăng nhập không hợp lệ', 'UNAUTHORIZED');
    }

    const db = req.app.locals.db;
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, data.user.id))
      .limit(1);

    if (!profile || profile.status === 'deleted') {
      throw new AppError(401, 'Tài khoản không tồn tại', 'UNAUTHORIZED');
    }

    if (profile.status === 'suspended') {
      throw new AppError(403, 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.', 'SUSPENDED');
    }

    const emailVerified = Boolean(data.user.email_confirmed_at) || DEMO_MODE;
    let status = profile.status;
    if (emailVerified && status === 'pending_email_verification') {
      await syncProfileStatusOnLogin(db, profile.id, emailVerified);
      status = 'active';
    }
    const role = profile.role as UserRole;

    req.user = {
      id: profile.id,
      email: profile.email,
      phone: profile.phone ?? null,
      role,
      status,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl ?? null,
      emailVerified,
    };

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
