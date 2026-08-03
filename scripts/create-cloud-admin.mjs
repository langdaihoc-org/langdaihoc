/**
 * Create cloud admin only (no seed catalog).
 * Usage: set env from Railway, then node scripts/create-cloud-admin.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'packages/database/package.json'));
const postgres = require('postgres');
const { createClient } = require('@supabase/supabase-js');

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'langdaihoc.work@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Demo1234';

const ADMIN_NAME = 'Quản trị viên';

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Need DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
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
    await supabase.auth.admin.updateUserById(user.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: ADMIN_NAME, role: 'admin' },
    });
    console.log('Updated existing auth user');
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
  console.log(`Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
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
