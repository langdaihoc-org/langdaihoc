/**
 * Create cloud admin only (no seed catalog).
 * Usage: set env from Railway, then:
 *   ALLOW_DESTRUCTIVE=1 CONFIRM_DESTRUCTIVE=I_UNDERSTAND ADMIN_PASSWORD='...' \
 *   railway run --service api -- node scripts/create-cloud-admin.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDestructive, loadApiEnv } from './lib/assert-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadApiEnv(root);
assertLocalDestructive('create-cloud-admin');

const require = createRequire(join(root, 'packages/database/package.json'));
const postgres = require('postgres');
const { createClient } = require('@supabase/supabase-js');

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'langdaihoc.work@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim();
const ADMIN_NAME = 'Quản trị viên';

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Need DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('ADMIN_PASSWORD is required (min 8 chars). No default password.');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, ssl: 'require' });
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
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
    console.log('Created auth user');
  } else {
    if (process.env.FORCE_RESET_PASSWORD !== '1') {
      console.error(
        `Admin ${ADMIN_EMAIL} already exists. Refusing to reset password. Set FORCE_RESET_PASSWORD=1 to override.`,
      );
      process.exit(1);
    }
    await supabase.auth.admin.updateUserById(user.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: ADMIN_NAME, role: 'admin' },
    });
    console.log('Updated existing auth user (FORCE_RESET_PASSWORD=1)');
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

  const rows = await sql`select email, role, status from profiles where email = ${ADMIN_EMAIL}`;
  console.log('Profile:', rows[0]);
  console.log(`Login: ${ADMIN_EMAIL} / (password from ADMIN_PASSWORD)`);
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
