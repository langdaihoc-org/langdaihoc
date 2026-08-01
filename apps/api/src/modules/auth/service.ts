import { eq, and } from 'drizzle-orm';
import type { Database } from '@langdaihoc/database';
import { profiles, sellers, userRoles } from '@langdaihoc/database';
import type { UserRole } from '@langdaihoc/shared';
import { extractEmailDomain, normalizePhoneVN } from '@langdaihoc/shared';
import { AppError } from '../../middleware/error-handler.js';


const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  'yopmail.com',
]);

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
