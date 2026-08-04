/**
 * Wipe local DB data (public tables + auth users + storage objects).
 * Keeps schema / drizzle migrations.
 * Usage: node scripts/clear-all-db.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDestructive, loadApiEnv } from './lib/assert-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadApiEnv(root);
assertLocalDestructive('clear-all-db');

const require = createRequire(join(root, 'packages/database/package.json'));
const postgres = require('postgres');
const { createClient } = require('@supabase/supabase-js');

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Thiếu SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
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

  try {
    const objs = await sql`select count(*)::int as c from storage.objects`;
    if (objs[0].c > 0) {
      await sql`delete from storage.objects`;
      console.log(`Cleared storage.objects: ${objs[0].c}`);
    }
  } catch (e) {
    console.log('storage skip:', e.message);
  }

  let deletedAuth = 0;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) throw error;
    const users = data?.users ?? [];
    if (!users.length) break;
    for (const u of users) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) console.error('auth delete fail', u.email, delErr.message);
      else deletedAuth++;
    }
  }

  const counts = await sql`
    select 'profiles' as t, count(*)::int as c from profiles
    union all select 'orders', count(*)::int from orders
    union all select 'sellers', count(*)::int from sellers
    union all select 'food_items', count(*)::int from food_items
  `;
  console.log('Auth users deleted:', deletedAuth);
  console.log(
    'Remaining:',
    Object.fromEntries(counts.map((r) => [r.t, r.c])),
  );
  await sql.end({ timeout: 5 });
  console.log('DONE: DB cleared');
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
