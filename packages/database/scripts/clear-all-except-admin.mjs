/**
 * Xóa toàn bộ user/data app, giữ admin@demo.local (+ Auth tương ứng).
 * Production: ALLOW_DESTRUCTIVE=1 CONFIRM_DESTRUCTIVE=I_UNDERSTAND
 *
 * Usage:
 *   railway run --service api -- node packages/database/scripts/clear-all-except-admin.mjs
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { assertLocalDestructive, loadApiEnv } from '../../../scripts/lib/assert-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
loadApiEnv(root);
assertLocalDestructive('clear-all-except-admin');

const require = createRequire(join(root, 'packages/database/package.json'));
const postgres = require('postgres');

const KEEP_EMAIL = process.env.KEEP_ADMIN_EMAIL ?? 'langdaihoc.work@gmail.com';
const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Thiếu DATABASE_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 4, prepare: false, ssl: 'require' });
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const [admin] = await sql`
    select id, email, role from profiles where email = ${KEEP_EMAIL} limit 1
  `;
  if (!admin) {
    throw new Error(`Không tìm thấy ${KEEP_EMAIL} — dừng để tránh wipe admin`);
  }
  console.log(`Keep admin: ${admin.email} (${admin.id})`);

  const targets = await sql`
    select id, email, role from profiles where email <> ${KEEP_EMAIL} order by email
  `;
  console.log(`Delete ${targets.length} profiles:`);
  for (const p of targets) console.log(`  - ${p.email} (${p.role})`);

  const ids = targets.map((p) => p.id);
  const sellers = ids.length
    ? await sql`select id from sellers where user_id = any(${ids})`
    : [];
  const sellerIds = sellers.map((s) => s.id);

  const orderRows =
    ids.length || sellerIds.length
      ? await sql`
          select id from orders
          where ${ids.length ? sql`buyer_id = any(${ids})` : sql`false`}
             or ${sellerIds.length ? sql`seller_id = any(${sellerIds})` : sql`false`}
        `
      : [];
  const orderIds = orderRows.map((o) => o.id);

  if (orderIds.length) {
    await sql`delete from reviews where order_id = any(${orderIds})`;
    await sql`delete from complaints where order_id = any(${orderIds})`;
    await sql`delete from order_status_history where order_id = any(${orderIds})`;
    await sql`delete from payment_proofs where order_id = any(${orderIds})`;
    await sql`delete from order_items where order_id = any(${orderIds})`;
    await sql`delete from laundry_order_details where order_id = any(${orderIds})`;
    await sql`delete from ship_proxy_order_details where order_id = any(${orderIds})`;
    await sql`delete from orders where id = any(${orderIds})`;
    console.log(`Deleted ${orderIds.length} orders (+ deps)`);
  }

  if (ids.length) {
    await sql`delete from reviews where buyer_id = any(${ids})`;
    await sql`delete from complaints where buyer_id = any(${ids})`;
    await sql`delete from complaint_messages where author_id = any(${ids})`;
    await sql`delete from notifications where user_id = any(${ids})`;
    await sql`delete from carts where user_id = any(${ids})`;
    await sql`delete from buyer_addresses where user_id = any(${ids})`;
    await sql`update audit_logs set actor_id = null where actor_id = any(${ids})`;
  }

  if (sellerIds.length) {
    await sql`update carts set seller_id = null where seller_id = any(${sellerIds})`;
    await sql`delete from reviews where seller_id = any(${sellerIds})`;
    await sql`delete from complaints where seller_id = any(${sellerIds})`;
    // food/laundry/bank cascade from sellers
    await sql`delete from sellers where id = any(${sellerIds})`;
    console.log(`Deleted ${sellerIds.length} sellers`);
  }

  if (ids.length) {
    const del = await sql`delete from profiles where id = any(${ids}) returning email`;
    console.log(`Deleted ${del.length} profiles`);
  }

  // Content tables (giữ categories để UI không trống hoàn toàn)
  const posts = await sql`delete from posts returning id`;
  const banners = await sql`delete from banners returning id`;
  const keys = await sql`delete from checkout_idempotency_keys returning id`.catch(() => []);
  console.log(`Cleared posts=${posts.length} banners=${banners.length} idempotency=${keys.length ?? 0}`);

  // Auth: xóa mọi user trừ admin
  let page = 1;
  let authDeleted = 0;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const users = data?.users ?? [];
    if (!users.length) break;
    for (const u of users) {
      if ((u.email || '').toLowerCase() === KEEP_EMAIL) continue;
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) console.warn(`auth delete ${u.email}: ${delErr.message}`);
      else authDeleted += 1;
    }
    if (users.length < 100) break;
    page += 1;
  }
  console.log(`Deleted ${authDeleted} auth users`);

  const left = await sql`select email, role, status from profiles order by email`;
  console.log('Remaining profiles:', left);
  await sql.end({ timeout: 5 });
  console.log('Done.');
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sql.end({ timeout: 5 });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
