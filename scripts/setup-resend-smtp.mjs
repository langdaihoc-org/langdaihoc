/**
 * Bật Supabase custom SMTP → Resend.
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  — https://supabase.com/dashboard/account/tokens
 *   RESEND_API_KEY         — re_…
 *   RESEND_FROM_EMAIL      — vd. noreply@langdaihoc.com.vn (domain verified trên Resend)
 *   RESEND_SENDER_NAME     — optional, mặc định "Làng Đại Học"
 *   SUPABASE_PROJECT_REF   — optional, mặc định gzietvaysffjizasmyfy
 *
 * Usage: node scripts/setup-resend-smtp.mjs
 */
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const apiKey = process.env.RESEND_API_KEY?.trim();
const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
const senderName = process.env.RESEND_SENDER_NAME?.trim() || 'langdaihoc';
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || 'gzietvaysffjizasmyfy';

if (!token || !apiKey || !fromEmail) {
  console.error(`
Thiếu env. Ví dụ:

  $env:SUPABASE_ACCESS_TOKEN="sbp_..."
  $env:RESEND_API_KEY="re_..."
  $env:RESEND_FROM_EMAIL="noreply@langdaihoc.com.vn"
  node scripts/setup-resend-smtp.mjs
`);
  process.exit(1);
}

const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const body = {
  external_email_enabled: true,
  mailer_autoconfirm: false,
  smtp_host: 'smtp.resend.com',
  smtp_port: '465',
  smtp_user: 'resend',
  smtp_pass: apiKey,
  smtp_admin_email: fromEmail,
  smtp_sender_name: senderName,
};

const res = await fetch(url, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error('Supabase Auth config failed:', res.status, text);
  process.exit(1);
}

console.log('OK — Supabase SMTP → Resend');
console.log(`  project: ${projectRef}`);
console.log(`  from:    ${senderName} <${fromEmail}>`);
console.log('Tiếp: Authentication → Rate Limits → tăng email/hour nếu cần.');
