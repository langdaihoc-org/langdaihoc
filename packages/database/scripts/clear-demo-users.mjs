/**
 * Xóa tài khoản demo seed (giữ admin@demo.local) để test tay đăng ký.
 * Usage: node packages/database/scripts/clear-demo-users.mjs
 * Chỉ local (hoặc ALLOW_DESTRUCTIVE=1).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { assertLocalDestructive, loadApiEnv } from '../../../scripts/lib/assert-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
loadApiEnv(root);
assertLocalDestructive('clear-demo-users');

const require = createRequire(join(root, 'packages/database/package.json'));
const postgres = require('postgres');

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEEP_EMAILS = new Set(['admin@demo.local']);

const sql = postgres(DATABASE_URL, { max: 4, prepare: false });

async function main() {
  const profiles = await sql`
    select id, email, role from profiles
    where email like '%@demo.local'
       or email = 'buyer@hcmut.edu.vn'
    order by email
  `;
  const targets = profiles.filter((p) => !KEEP_EMAILS.has(p.email));
  console.log(`Keep: ${[...KEEP_EMAILS].join(', ')}`);
  console.log(`Delete ${targets.length} demo users:`);
  for (const p of targets) console.log(`  - ${p.email} (${p.role})`);

  if (targets.length === 0) {
    await sql.end();
    return;
  }

  const ids = targets.map((p) => p.id);
  const sellers = await sql`select id, user_id from sellers where user_id = any(${ids})`;
  const sellerIds = sellers.map((s) => s.id);
  console.log(`Sellers to delete: ${sellerIds.length}`);

  // Collect order ids first — reviews/complaints FK to orders without cascade
  const orderRows = await sql`
    select id from orders
    where buyer_id = any(${ids})
       or (cardinality(${sellerIds}::uuid[]) > 0 and seller_id = any(${sellerIds}))
  `;
  const orderIds = orderRows.map((o) => o.id);

  if (orderIds.length) {
    await sql`delete from reviews where order_id = any(${orderIds})`;
    await sql`delete from complaints where order_id = any(${orderIds})`;
  }

  if (sellerIds.length) {
    await sql`delete from reviews where buyer_id = any(${ids}) or seller_id = any(${sellerIds})`;
    await sql`delete from complaints where buyer_id = any(${ids}) or seller_id = any(${sellerIds})`;
    await sql`update carts set seller_id = null where seller_id = any(${sellerIds})`;
  } else {
    await sql`delete from reviews where buyer_id = any(${ids})`;
    await sql`delete from complaints where buyer_id = any(${ids})`;
  }

  await sql`delete from complaint_messages where author_id = any(${ids})`;
  await sql`update audit_logs set actor_id = null where actor_id = any(${ids})`;

  const delOrders = orderIds.length
    ? await sql`delete from orders where id = any(${orderIds}) returning id`
    : [];
  console.log(`Deleted ${delOrders.length} orders`);

  if (sellerIds.length) {
    const delSellers = await sql`delete from sellers where id = any(${sellerIds}) returning id`;
    console.log(`Deleted ${delSellers.length} sellers`);
  }

  const delProfiles = await sql`delete from profiles where id = any(${ids}) returning email`;
  console.log(`Deleted ${delProfiles.length} profiles`);

  if (!SERVICE_KEY) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY missing — skip auth cleanup');
  } else {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let authDeleted = 0;
    for (const p of targets) {
      const { error } = await supabase.auth.admin.deleteUser(p.id);
      if (!error) authDeleted++;
      else console.warn(`auth delete ${p.email}: ${error.message}`);
    }
    console.log(`Deleted ${authDeleted} auth users`);
  }

  await sql.end();
  console.log('Done. Refresh /admin/users — chỉ còn quản trị viên.');
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sql.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
