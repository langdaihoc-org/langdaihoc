/**
 * Giữ đúng một admin — xóa hết user/data còn lại.
 * Bắt buộc KEEP_ADMIN_EMAIL + SEED_PASSWORD (không default Demo1234).
 * Usage: ALLOW_DESTRUCTIVE=1 node scripts/keep-admin-only.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDestructive, loadApiEnv } from './lib/assert-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadApiEnv(root);
assertLocalDestructive('keep-admin-only');

const require = createRequire(join(root, 'packages/database/package.json'));
const postgres = require('postgres');
const { createClient } = require('@supabase/supabase-js');

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = (process.env.KEEP_ADMIN_EMAIL ?? '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_PASSWORD?.trim();
const ADMIN_NAME = 'Quản trị viên';

if (!SERVICE_KEY) {
  console.error('Thiếu SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!ADMIN_EMAIL) {
  console.error('KEEP_ADMIN_EMAIL is required');
  process.exit(1);
}
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('SEED_PASSWORD is required (min 8 chars). No default password.');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureAdmin() {
  const { data: list, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  let user = (list?.users ?? []).find((u) => u.email === ADMIN_EMAIL);
  if (!user) {
    const { data, error: createErr } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: ADMIN_NAME, role: 'admin' },
    });
    if (createErr) throw createErr;
    user = data.user;
    console.log('Created auth admin:', ADMIN_EMAIL);
  } else {
    await supabase.auth.admin.updateUserById(user.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: ADMIN_NAME, role: 'admin' },
    });
    console.log('Reset auth admin:', ADMIN_EMAIL);
  }

  await sql`
    insert into profiles (id, email, full_name, role, status)
    values (${user.id}, ${ADMIN_EMAIL}, ${ADMIN_NAME}, 'admin', 'active')
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      role = 'admin',
      status = 'active'
  `;
  await sql`
    insert into user_roles (user_id, role)
    values (${user.id}, 'admin')
    on conflict do nothing
  `;
  return user.id;
}

async function wipeExceptAdmin(adminId) {
  const tables = await sql`
    select tablename from pg_tables
    where schemaname = 'public'
    order by tablename
  `;
  console.log(`Truncating ${tables.length} public tables...`);
  if (tables.length) {
    const list = tables.map((t) => `public."${t.tablename}"`).join(', ');
    await sql.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }

  // Re-insert admin profile after truncate
  await sql`
    insert into profiles (id, email, full_name, role, status)
    values (${adminId}, ${ADMIN_EMAIL}, ${ADMIN_NAME}, 'admin', 'active')
  `;
  await sql`
    insert into user_roles (user_id, role)
    values (${adminId}, 'admin')
  `;

  // Delete every auth user except admin — luôn page 1 vì xóa làm list dịch.
  let deleted = 0;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) throw error;
    const users = (data?.users ?? []).filter((u) => u.id !== adminId && u.email !== ADMIN_EMAIL);
    if (!users.length) break;
    for (const u of users) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) console.warn('auth delete fail', u.email, delErr.message);
      else deleted++;
    }
  }
  console.log('Auth users deleted (non-admin):', deleted);
}
async function main() {
  const adminId = await ensureAdmin();
  await wipeExceptAdmin(adminId);

  const profiles = await sql`select email, role, status from profiles order by email`;
  const { data } = await supabase.auth.admin.listUsers({ perPage: 100 });
  console.log('\nCòn lại profiles:');
  for (const p of profiles) console.log(`  ${p.role} ${p.email} (${p.status})`);
  console.log(
    'Auth emails:',
    (data?.users ?? []).map((u) => u.email).join(', ') || '(none)',
  );
  console.log(`\nAdmin kept: ${ADMIN_EMAIL}`);
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
