import { eq, and } from 'drizzle-orm';
import type { Database } from '@langdaihoc/database';
import { profiles, sellers, userRoles } from '@langdaihoc/database';
import type { UserRole } from '@langdaihoc/shared';
import { DEMO_MODE, extractEmailDomain, normalizePhoneVN } from '@langdaihoc/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../middleware/error-handler.js';
import { createSupabaseAnon } from '../../lib/supabase.js';


const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  'yopmail.com',
]);

export function formatAuthError(err: unknown): string {
  if (!err) return 'unknown';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) {
    const extra = err as Error & { status?: number; code?: string };
    return JSON.stringify({
      message: err.message,
      status: extra.status,
      code: extra.code,
      name: err.name,
    });
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Tạo user Auth.
 * - DEMO: admin.createUser + email_confirm (không gửi mail).
 * - Prod: anon.signUp — Supabase mailer tự gửi xác minh (createUser+resend thường fail).
 */
export async function createAuthUserForRegister(opts: {
  email: string;
  password: string;
  fullName: string;
  role: 'buyer' | 'seller';
  emailRedirectTo: string;
  supabaseAdmin: SupabaseClient;
}): Promise<{ userId: string }> {
  if (DEMO_MODE) {
    const { data, error } = await opts.supabaseAdmin.auth.admin.createUser({
      email: opts.email,
      password: opts.password,
      email_confirm: true,
      user_metadata: { full_name: opts.fullName, role: opts.role },
    });
    if (error || !data.user) {
      throw new AppError(400, error?.message || 'Không thể tạo tài khoản', 'SIGNUP_FAILED');
    }
    return { userId: data.user.id };
  }

  const anon = createSupabaseAnon();
  const { data, error } = await anon.auth.signUp({
    email: opts.email,
    password: opts.password,
    options: {
      emailRedirectTo: opts.emailRedirectTo,
      data: { full_name: opts.fullName, role: opts.role },
    },
  });
  if (error) {
    throw new AppError(400, error.message || 'Không thể tạo tài khoản', 'SIGNUP_FAILED');
  }
  if (!data.user) {
    throw new AppError(400, 'Không thể tạo tài khoản', 'SIGNUP_FAILED');
  }
  // Email đã tồn tại: Supabase có thể trả user với identities rỗng (anti-enumeration).
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new AppError(409, 'Email đã được sử dụng', 'EMAIL_EXISTS');
  }
  return { userId: data.user.id };
}

/** Gửi lại mail xác minh — dùng anon client (đúng API public resend). */
export async function resendSignupConfirmation(email: string, emailRedirectTo: string) {
  const anon = createSupabaseAnon();
  return anon.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo },
  });
}

export function validateBuyerEmail(email: string) {
  const domain = extractEmailDomain(email);

  if (!domain) {
    throw new AppError(400, 'Email không hợp lệ', 'INVALID_EMAIL');
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    throw new AppError(400, 'Email tạm thời không được chấp nhận', 'DISPOSABLE_EMAIL');
  }
}

export async function ensureEmailNotUsed(db: Database, email: string, exceptUserId?: string) {
  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email.toLowerCase()))
    .limit(1);

  if (existing && existing.id !== exceptUserId) {
    throw new AppError(409, 'Email đã được sử dụng', 'EMAIL_EXISTS');
  }
}

export async function ensurePhoneNotUsed(db: Database, phone: string, exceptUserId?: string) {
  const normalized = normalizePhoneVN(phone);
  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.phone, normalized))
    .limit(1);

  if (existing && existing.id !== exceptUserId) {
    throw new AppError(409, 'Số điện thoại đã được sử dụng', 'PHONE_EXISTS');
  }
}

/** Resolve email đăng nhập từ identifier (email hoặc SĐT đã chuẩn hóa). */
export async function resolveAuthEmail(db: Database, identifier: string): Promise<string | null> {
  if (identifier.includes('@')) {
    const [row] = await db
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.email, identifier.toLowerCase()))
      .limit(1);
    return row?.email ?? identifier.toLowerCase();
  }

  const [row] = await db
    .select({ email: profiles.email })
    .from(profiles)
    .where(eq(profiles.phone, identifier))
    .limit(1);
  return row?.email ?? null;
}

export async function syncProfileStatusOnLogin(db: Database, userId: string, emailVerified: boolean) {
  if (!emailVerified) return;

  await db
    .update(profiles)
    .set({
      status: 'active',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(profiles.id, userId),
        eq(profiles.status, 'pending_email_verification'),
      ),
    );
}

export async function getSellerByUserId(db: Database, userId: string) {
  const [seller] = await db
    .select()
    .from(sellers)
    .where(eq(sellers.userId, userId))
    .limit(1);
  return seller ?? null;
}

export async function ensureUserRole(db: Database, userId: string, role: UserRole) {
  await db
    .insert(userRoles)
    .values({ userId, role })
    .onConflictDoNothing({ target: [userRoles.userId, userRoles.role] });
}

export function roleHomePath(role: UserRole): string {
  if (role === 'seller') return '/seller';
  if (role === 'admin') return '/admin';
  return '/';
}
