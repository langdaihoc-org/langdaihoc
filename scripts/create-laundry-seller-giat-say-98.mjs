/**
 * Tạo seller GIẶT SẤY 98 + bảng giá dịch vụ giặt trên cloud.
 *
 * Usage:
 *   ALLOW_DESTRUCTIVE=1 CONFIRM_DESTRUCTIVE=I_UNDERSTAND \
 *   SELLER_EMAIL='...' SELLER_PASSWORD='...' \
 *   BANNER_PATH='...' \
 *   railway run -s api -- node scripts/create-laundry-seller-giat-say-98.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalDestructive, loadApiEnv } from './lib/assert-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
loadApiEnv(root);
assertLocalDestructive('create-laundry-seller-giat-say-98');

const require = createRequire(join(root, 'packages/database/package.json'));
const postgres = require('postgres');
const { createClient } = require('@supabase/supabase-js');

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.env.SELLER_EMAIL ?? 'tieumao56@gmail.com').trim().toLowerCase();
const PASSWORD = process.env.SELLER_PASSWORD?.trim();
const BANNER_PATH =
  process.env.BANNER_PATH?.trim() ||
  join(
    process.env.USERPROFILE || '',
    'AppData/Roaming/Cursor/User/workspaceStorage/166258a71b3134a8c30bd6fc6ca17f39/images',
    'c__Users_buida_AppData_Roaming_Cursor_User_workspaceStorage_166258a71b3134a8c30bd6fc6ca17f39_images_image-60c13bd9-21ed-4e60-9f4d-f70defe64b56.png',
  );

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Need DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!PASSWORD || PASSWORD.length < 8) {
  console.error('SELLER_PASSWORD required (min 8)');
  process.exit(1);
}

const SHOP = {
  fullName: 'Giặt Sấy 98',
  phone: '0941431462',
  shopName: 'GIẶT SẤY 98',
  businessAddress: '67 Tô Vĩnh Diện, Đông Hòa, Dĩ An, Bình Dương',
  openHours: 'Sáng 9:00–12:00 · Tối 17:00–20:00 · Sau 20:00–22:00 nhận tại rào',
  serviceAreas: [
    'KTX khu B',
    'Khu quân sự',
    'Chung cư HT',
    'Chung cư Phúc Đạt',
    'Bcons Plaza',
    'Bcons City',
    'Bcons Green View',
    'Đường ống nước',
    'Làng Đại học',
    'Tô Vĩnh Diện',
    'Tân Hòa',
  ],
  description: [
    'SHIP TẬN TÒA KTX KHU B · Giặt riêng mỗi bạn một máy · Giao nhận tận tòa – trả đồ trong ngày.',
    '',
    'Khu vực: KTX khu B, khu quân sự, chung cư HT & Phúc Đạt, Bcons Plaza/City/Green View, đường ống nước, quanh Làng ĐH, Tô Vĩnh Diện, Tân Hòa.',
    '',
    'Giờ giao–trả: Sáng 9:00–12:00 · Tối 17:00–20:00 · 20:00–22:00 nhận tại rào.',
    '',
    'Lưu ý: đồ trắng/màu cần giặt riêng hãy note khi gửi. Không giải quyết khiếu nại nếu không dặn trước hoặc sau 24h kể từ lúc nhận đơn.',
    '',
    'Zalo/ĐT: 0941431462',
  ].join('\n'),
};

/** @type {{ name: string, description: string, unit: 'kg'|'item'|'load', basePrice: number, estimatedTimeHours: number }[]} */
const SERVICES = [
  {
    name: 'Giặt sấy — dưới 3.5kg',
    description: '30k/lần giặt (dưới 3.5kg). Giặt riêng mỗi bạn một máy.',
    unit: 'load',
    basePrice: 30000,
    estimatedTimeHours: 12,
  },
  {
    name: 'Giặt sấy — trên 3.5kg',
    description: '9k/kg khi trên 3.5kg. Giặt riêng mỗi bạn một máy.',
    unit: 'kg',
    basePrice: 9000,
    estimatedTimeHours: 12,
  },
  {
    name: 'Gấu bông',
    description: '10–40k tùy kích thước hoặc 30k/kg. Báo size khi đặt.',
    unit: 'kg',
    basePrice: 30000,
    estimatedTimeHours: 24,
  },
  {
    name: 'Mền / rèm / drap / ruột gối',
    description: '20k/kg',
    unit: 'kg',
    basePrice: 20000,
    estimatedTimeHours: 24,
  },
  {
    name: 'Mền chần bông / chăn lông dày',
    description: '25k/kg',
    unit: 'kg',
    basePrice: 25000,
    estimatedTimeHours: 24,
  },
  {
    name: 'Topper',
    description: '30k/kg',
    unit: 'kg',
    basePrice: 30000,
    estimatedTimeHours: 24,
  },
  {
    name: 'Giày',
    description: '30k/đôi',
    unit: 'item',
    basePrice: 30000,
    estimatedTimeHours: 24,
  },
  {
    name: 'Chiếu',
    description: '20k/chiếc',
    unit: 'item',
    basePrice: 20000,
    estimatedTimeHours: 24,
  },
  {
    name: 'Ba lô',
    description: '15–20k/chiếc (mặc định 20k; báo size khi đặt)',
    unit: 'item',
    basePrice: 20000,
    estimatedTimeHours: 24,
  },
  {
    name: 'Giặt thường vắt ráo',
    description: '4k/kg — tối thiểu 25k/lần',
    unit: 'kg',
    basePrice: 4000,
    estimatedTimeHours: 12,
  },
  {
    name: 'Giặt riêng đồ trắng — phụ thu',
    description: 'Dưới 5 cái: phụ thu 10k. Từ 5 cái: tính riêng 1 lần giặt.',
    unit: 'load',
    basePrice: 10000,
    estimatedTimeHours: 12,
  },
];

const sql = postgres(DATABASE_URL, { max: 1, ssl: 'require' });
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function contentTypeFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function uploadBanner(sellerId) {
  if (!BANNER_PATH || !existsSync(BANNER_PATH)) {
    console.log('No banner file, skip avatar upload:', BANNER_PATH);
    return null;
  }
  const buf = readFileSync(BANNER_PATH);
  const ct = contentTypeFor(BANNER_PATH);
  const ext = (ct.split('/')[1] || 'png').replace('jpeg', 'jpg');
  const objectPath = `${sellerId}/shop-banner.${ext}`;
  const bucket = 'laundry-images';

  // ensure bucket exists (public)
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === bucket)) {
    await supabase.storage.createBucket(bucket, { public: true });
  }

  const { error: upErr } = await supabase.storage.from(bucket).upload(objectPath, buf, {
    contentType: ct,
    upsert: true,
  });
  if (upErr) {
    console.error('Banner upload failed:', upErr.message);
    return null;
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  console.log('Banner uploaded:', data.publicUrl);
  return data.publicUrl;
}

async function findAuthUserByEmail(email) {
  // Paginate a bit — small projects
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = (data?.users ?? []).find((u) => (u.email || '').toLowerCase() === email);
    if (found) return found;
    if ((data?.users?.length ?? 0) < 200) break;
  }
  return null;
}

async function main() {
  let user = await findAuthUserByEmail(EMAIL);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: SHOP.fullName, role: 'seller' },
    });
    if (error) throw error;
    user = data.user;
    console.log('Created auth user', user.id);
  } else {
    await supabase.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: SHOP.fullName, role: 'seller' },
    });
    console.log('Updated existing auth user', user.id);
  }

  await sql`
    insert into profiles (id, email, full_name, role, status, phone)
    values (${user.id}, ${EMAIL}, ${SHOP.fullName}, 'seller', 'active', ${SHOP.phone})
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      role = 'seller',
      status = 'active',
      phone = excluded.phone,
      updated_at = now()
  `;

  await sql`
    insert into user_roles (user_id, role)
    values (${user.id}, 'seller')
    on conflict do nothing
  `;

  const existingSeller = await sql`select id from sellers where user_id = ${user.id} limit 1`;
  let sellerId = existingSeller[0]?.id;
  if (!sellerId) {
    const inserted = await sql`
      insert into sellers (
        user_id, shop_name, service_types, business_address, description,
        phone, open_hours, service_areas, status, approved_at, accepting_orders, avg_delivery_minutes
      ) values (
        ${user.id},
        ${SHOP.shopName},
        'laundry',
        ${SHOP.businessAddress},
        ${SHOP.description},
        ${SHOP.phone},
        ${SHOP.openHours},
        ${SHOP.serviceAreas},
        'approved',
        now(),
        true,
        ${12 * 60}
      )
      returning id
    `;
    sellerId = inserted[0].id;
    console.log('Created seller', sellerId);
  } else {
    await sql`
      update sellers set
        shop_name = ${SHOP.shopName},
        service_types = 'laundry',
        business_address = ${SHOP.businessAddress},
        description = ${SHOP.description},
        phone = ${SHOP.phone},
        open_hours = ${SHOP.openHours},
        service_areas = ${SHOP.serviceAreas},
        status = 'approved',
        approved_at = coalesce(approved_at, now()),
        accepting_orders = true,
        avg_delivery_minutes = ${12 * 60},
        updated_at = now()
      where id = ${sellerId}
    `;
    console.log('Updated seller', sellerId);
  }

  const avatarUrl = await uploadBanner(sellerId);
  if (avatarUrl) {
    await sql`update sellers set avatar_url = ${avatarUrl}, updated_at = now() where id = ${sellerId}`;
  }

  // Replace services for this shop (idempotent re-run)
  await sql`delete from laundry_services where seller_id = ${sellerId}`;
  for (const s of SERVICES) {
    await sql`
      insert into laundry_services (
        seller_id, name, description, unit, base_price, estimated_time_hours, service_areas, is_available
      ) values (
        ${sellerId},
        ${s.name},
        ${s.description},
        ${s.unit},
        ${String(s.basePrice)},
        ${s.estimatedTimeHours},
        ${SHOP.serviceAreas},
        true
      )
    `;
  }

  const svcCount = await sql`select count(*)::int as n from laundry_services where seller_id = ${sellerId}`;
  const shop = await sql`
    select shop_name, status, phone, accepting_orders, avatar_url
    from sellers where id = ${sellerId}
  `;
  console.log('Shop:', shop[0]);
  console.log('Services:', svcCount[0].n);
  console.log(`Login seller: ${EMAIL}`);
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
