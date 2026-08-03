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
 * Tạo user Auth chưa xác minh email (trừ DEMO).
 * Prod: admin.createUser(email_confirm:false) — tránh signUp auto-confirm khi
 * dashboard tắt "Confirm email". Mail gửi riêng qua sendSignupVerificationEmail.
 */
export async function createAuthUserForRegister(opts: {
  email: string;
  password: string;
  fullName: string;
  role: 'buyer' | 'seller';
  emailRedirectTo: string;
  supabaseAdmin: SupabaseClient;
}): Promise<{ userId: string }> {
  const { data, error } = await opts.supabaseAdmin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: DEMO_MODE,
    user_metadata: { full_name: opts.fullName, role: opts.role },
  });
  if (error || !data.user) {
    throw new AppError(400, error?.message || 'Không thể tạo tài khoản', 'SIGNUP_FAILED');
  }

  // Phòng hờ dashboard/SMTP auto-confirm: ép lại chưa xác minh trên prod.
  if (!DEMO_MODE && data.user.email_confirmed_at) {
    const { error: unconfirmErr } = await opts.supabaseAdmin.auth.admin.updateUserById(data.user.id, {
      email_confirm: false,
    });
    if (unconfirmErr) {
      console.error('[auth] failed to unconfirm auto-verified user', data.user.id, formatAuthError(unconfirmErr));
    }
  }

  return { userId: data.user.id };
}

/** Ép redirect mail xác minh về FRONTEND_URL (không để vercel.app). */
function withForcedRedirect(actionLink: string, redirectTo: string): string {
  try {
    const u = new URL(actionLink);
    if (u.searchParams.has('redirect_to')) {
      u.searchParams.set('redirect_to', redirectTo);
    }
    return u
      .toString()
      .replace(/https?:\/\/langdaihoc\.vercel\.app/gi, 'https://langdaihoc.xyz')
      .replace(/https%3A%2F%2Flangdaihoc\.vercel\.app/gi, encodeURIComponent('https://langdaihoc.xyz'));
  } catch {
    return actionLink
      .replace(/https?:\/\/langdaihoc\.vercel\.app/gi, 'https://langdaihoc.xyz')
      .replace(/https%3A%2F%2Flangdaihoc\.vercel\.app/gi, encodeURIComponent('https://langdaihoc.xyz'));
  }
}

async function sendViaResendApi(
  to: string,
  actionLink: string,
  redirectTo: string,
  content: {
    subject: string;
    eyebrow: string;
    body: string;
    cta: string;
    footer: string;
  },
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return false;

  const senderName = process.env.RESEND_SENDER_NAME?.trim() || 'langdaihoc';
  const link = withForcedRedirect(actionLink, redirectTo);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${senderName} <${from}>`,
      to: [to],
      subject: content.subject,
      html: `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef6fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef6fb;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #c5e4f5;">
        <tr><td style="padding:28px 28px 8px;text-align:center;">
          <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0b3a6b;">langdaihoc</div>
          <div style="margin-top:6px;font-size:13px;color:#64748b;">${content.eyebrow}</div>
        </td></tr>
        <tr><td style="padding:8px 28px 28px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Chào bạn,</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#334155;">
            ${content.body}
          </p>
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 24px;">
            <tr><td style="border-radius:999px;background:#2eb7e5;">
              <a href="${link}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                ${content.cta}
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
            ${content.footer}
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;">© langdaihoc · langdaihoc.xyz</p>
    </td></tr>
  </table>
</body>
</html>`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[auth] Resend API failed', res.status, body);
    return false;
  }
  return true;
}

/**
 * Gửi mail xác minh.
 * 1) generateLink + Resend API (ổn định khi có RESEND_*)
 * 2) fallback Supabase auth.resend (cần SMTP trên dashboard)
 */
export async function sendSignupVerificationEmail(
  supabaseAdmin: SupabaseClient,
  email: string,
  emailRedirectTo: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: emailRedirectTo },
  });
  const actionLink = linkData?.properties?.action_link;
  if (!linkErr && actionLink) {
    const sent = await sendViaResendApi(email, actionLink, emailRedirectTo, {
      subject: 'Xác minh email — langdaihoc',
      eyebrow: 'Xác minh tài khoản',
      body: 'Nhấn nút bên dưới để xác minh email và kích hoạt tài khoản trên langdaihoc.',
      cta: 'Xác minh email',
      footer: 'Nếu bạn không đăng ký, hãy bỏ qua email này. Nút chỉ dùng một lần.',
    });
    if (sent) return { ok: true };
  }

  const { error: resendErr } = await createSupabaseAnon().auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo },
  });
  if (!resendErr) return { ok: true };

  const hasResendKey = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
  return {
    ok: false,
    error: [
      `hasLink=${Boolean(actionLink)}`,
      `linkErr=${formatAuthError(linkErr)}`,
      `resendApiConfigured=${hasResendKey}`,
      `supabaseResend=${formatAuthError(resendErr)}`,
    ].join('; '),
  };
}

/** Gửi mail đặt lại mật khẩu — generateLink recovery + Resend (cùng pipeline xác minh). */
export async function sendPasswordResetEmail(
  supabaseAdmin: SupabaseClient,
  email: string,
  emailRedirectTo: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: emailRedirectTo },
  });
  const actionLink = linkData?.properties?.action_link;
  if (!linkErr && actionLink) {
    const sent = await sendViaResendApi(email, actionLink, emailRedirectTo, {
      subject: 'Đặt lại mật khẩu — langdaihoc',
      eyebrow: 'Khôi phục tài khoản',
      body: 'Nhấn nút bên dưới để đặt lại mật khẩu tài khoản langdaihoc của bạn.',
      cta: 'Đặt lại mật khẩu',
      footer: 'Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Nút chỉ dùng một lần.',
    });
    if (sent) return { ok: true };
  }

  const { error: resetErr } = await createSupabaseAnon().auth.resetPasswordForEmail(email, {
    redirectTo: emailRedirectTo,
  });
  if (!resetErr) return { ok: true };

  return {
    ok: false,
    error: [
      `hasLink=${Boolean(actionLink)}`,
      `linkErr=${formatAuthError(linkErr)}`,
      `supabaseReset=${formatAuthError(resetErr)}`,
    ].join('; '),
  };
}

/** Gửi lại mail xác minh — cùng pipeline với đăng ký. */
export async function resendSignupConfirmation(
  supabaseAdmin: SupabaseClient,
  email: string,
  emailRedirectTo: string,
) {
  return sendSignupVerificationEmail(supabaseAdmin, email, emailRedirectTo);
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

/** Chỉ trả email nếu đã có profile đăng ký (dùng quên mật khẩu / tồn tại tài khoản). */
export async function findRegisteredAuthEmail(
  db: Database,
  identifier: string,
): Promise<string | null> {
  if (identifier.includes('@')) {
    const [row] = await db
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.email, identifier.toLowerCase()))
      .limit(1);
    return row?.email ?? null;
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
