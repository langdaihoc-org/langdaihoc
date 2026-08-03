/**
 * Đổi email admin (Auth + profiles) — production.
 *
 * Usage:
 *   railway run --service api -- node scripts/rename-admin-email.mjs
 *
 * Env:
 *   FROM_ADMIN_EMAIL (default admin@demo.local)
 *   TO_ADMIN_EMAIL   (default langdaihoc.work@gmail.com)
 *   ALLOW_DESTRUCTIVE=1 CONFIRM_DESTRUCTIVE=I_UNDERSTAND (bắt buộc trên prod)
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDestructive, loadApiEnv } from './lib/assert-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadApiEnv(root);
assertLocalDestructive('rename-admin-email');

const require = createRequire(join(root, 'packages/database/package.json'));
const postgres = require('postgres');
const { createClient } = require('@supabase/supabase-js');

const FROM_EMAIL = (process.env.FROM_ADMIN_EMAIL ?? 'admin@demo.local').trim().toLowerCase();
const TO_EMAIL = (process.env.TO_ADMIN_EMAIL ?? 'langdaihoc.work@gmail.com').trim().toLowerCase();
const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Thiếu DATABASE_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (FROM_EMAIL === TO_EMAIL) {
  console.error('FROM_ADMIN_EMAIL và TO_ADMIN_EMAIL trùng nhau');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, prepare: false, ssl: 'require' });
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const [fromProfile] = await sql`
    select id, email, role, status from profiles where lower(email) = ${FROM_EMAIL} limit 1
  `;
  if (!fromProfile) {
    throw new Error(`Không tìm thấy admin cũ: ${FROM_EMAIL}`);
  }
  if (fromProfile.role !== 'admin') {
    throw new Error(`${FROM_EMAIL} không phải role admin (role=${fromProfile.role})`);
  }

  const [toExists] = await sql`
    select id, email, role from profiles where lower(email) = ${TO_EMAIL} limit 1
  `;
  if (toExists && toExists.id !== fromProfile.id) {
    throw new Error(`Email đích đã dùng bởi user khác: ${TO_EMAIL} (${toExists.id})`);
  }

  console.log(`Rename admin ${FROM_EMAIL} → ${TO_EMAIL} (id=${fromProfile.id})`);

  const { data: authUser, error: getErr } = await supabase.auth.admin.getUserById(fromProfile.id);
  if (getErr || !authUser?.user) {
    throw new Error(`Không đọc được Auth user: ${getErr?.message ?? 'missing'}`);
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(fromProfile.id, {
    email: TO_EMAIL,
    email_confirm: true,
    user_metadata: {
      ...(authUser.user.user_metadata ?? {}),
      full_name: authUser.user.user_metadata?.full_name ?? 'Quản trị viên',
      role: 'admin',
    },
  });
  if (updateErr) throw updateErr;

  await sql`
    update profiles
    set email = ${TO_EMAIL},
        status = 'active',
        updated_at = now()
    where id = ${fromProfile.id}
  `;

  await sql`
    insert into user_roles (user_id, role)
    values (${fromProfile.id}, 'admin')
    on conflict do nothing
  `;

  const [row] = await sql`
    select email, role, status from profiles where id = ${fromProfile.id}
  `;
  console.log('Profile:', row);
  console.log('OK — đăng nhập / quên mật khẩu bằng', TO_EMAIL);
  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error(e);
  try {
    await sql.end({ timeout: 5 });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
