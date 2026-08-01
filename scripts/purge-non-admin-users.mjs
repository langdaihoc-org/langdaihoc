/**
 * Purge toàn bộ user trừ admin — dùng để test thủ công từ đầu.
 * Xóa: buyers/sellers + đơn hàng/giỏ liên quan + Auth users.
 * Giữ: mọi profile role=admin.
 *
 * Chạy: node scripts/purge-non-admin-users.mjs
 * Chỉ local (hoặc ALLOW_DESTRUCTIVE=1).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDestructive, loadApiEnv } from './lib/assert-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadApiEnv(root);
assertLocalDestructive('purge-non-admin-users');

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
  const before = await sql`
    select id, email, role, status from profiles order by role, email
  `;
  console.log('Trước khi xóa:');
  for (const p of before) console.log(`  ${String(p.role).padEnd(7)} ${p.email} (${p.status})`);

  const victims = before.filter((p) => p.role !== 'admin');
  if (victims.length === 0) {
    console.log('\nKhông có user nào ngoài admin.');
    await sql.end();
    return;
  }

  const victimIds = victims.map((p) => p.id);
  const sellerIds = (
    await sql`select id from sellers where user_id = any(${victimIds}::uuid[])`
  ).map((r) => r.id);

  console.log(`\nSẽ xóa ${victims.length} user (không phải admin)...`);

  await sql.begin(async (tx) => {
    await tx`update carts set seller_id = null where seller_id = any(${sellerIds}::uuid[])`;
    await tx`update audit_logs set actor_id = null where actor_id = any(${victimIds}::uuid[])`;

    const orderIds = (
      await tx`
        select id from orders
        where buyer_id = any(${victimIds}::uuid[])
           or seller_id = any(${sellerIds}::uuid[])
      `
    ).map((r) => r.id);

    if (orderIds.length) {
      await tx`delete from complaint_messages where complaint_id in (
        select id from complaints where order_id = any(${orderIds}::uuid[])
      )`;
      await tx`delete from complaints where order_id = any(${orderIds}::uuid[])`;
      await tx`delete from reviews where order_id = any(${orderIds}::uuid[])`;
      await tx`delete from payment_proofs where order_id = any(${orderIds}::uuid[])`;
      await tx`delete from order_status_history where order_id = any(${orderIds}::uuid[])`;
      await tx`delete from order_items where order_id = any(${orderIds}::uuid[])`;
      await tx`delete from laundry_order_details where order_id = any(${orderIds}::uuid[])`;
      await tx`delete from ship_proxy_order_details where order_id = any(${orderIds}::uuid[])`;
      await tx`delete from checkout_idempotency_keys where order_id = any(${orderIds}::uuid[])`;
      await tx`delete from orders where id = any(${orderIds}::uuid[])`;
    }

    await tx`delete from checkout_idempotency_keys where user_id = any(${victimIds}::uuid[])`;

    await tx`delete from cart_items where cart_id in (
      select id from carts where user_id = any(${victimIds}::uuid[])
    )`;
    await tx`delete from carts where user_id = any(${victimIds}::uuid[])`;
    await tx`delete from notifications where user_id = any(${victimIds}::uuid[])`;
    await tx`delete from buyer_addresses where user_id = any(${victimIds}::uuid[])`;
    await tx`delete from user_roles where user_id = any(${victimIds}::uuid[])`;

    if (sellerIds.length) {
      await tx`delete from food_item_options where food_item_id in (
        select id from food_items where seller_id = any(${sellerIds}::uuid[])
      )`;
      await tx`delete from food_option_groups where food_item_id in (
        select id from food_items where seller_id = any(${sellerIds}::uuid[])
      )`;
      await tx`update posts set food_item_id = null where food_item_id in (
        select id from food_items where seller_id = any(${sellerIds}::uuid[])
      )`;
      await tx`delete from food_items where seller_id = any(${sellerIds}::uuid[])`;
      await tx`delete from laundry_services where seller_id = any(${sellerIds}::uuid[])`;
      await tx`delete from seller_bank_accounts where seller_id = any(${sellerIds}::uuid[])`;
      await tx`delete from posts where seller_id = any(${sellerIds}::uuid[])`;
      await tx`delete from sellers where id = any(${sellerIds}::uuid[])`;
    }

    await tx`delete from profiles where id = any(${victimIds}::uuid[])`;
  });

  let authDeleted = 0;
  let authFailed = 0;
  for (const v of victims) {
    const { error } = await supabase.auth.admin.deleteUser(v.id);
    if (error) {
      authFailed += 1;
      console.warn(`  ! auth delete ${v.email}: ${error.message}`);
    } else {
      authDeleted += 1;
    }
  }

  const after = await sql`
    select id, email, role, status from profiles order by role, email
  `;
  console.log('\nCòn lại:');
  for (const p of after) console.log(`  ${String(p.role).padEnd(7)} ${p.email} (${p.status})`);
  console.log(`\nĐã xóa profiles: ${victims.length}, auth: ${authDeleted}, auth lỗi: ${authFailed}`);

  await sql.end();
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
