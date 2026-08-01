/**
 * Local/dev seed — run: pnpm db:seed
 * Không chạy trên DB production / deploy test dùng chung với user thật.
 */
import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

config({
  path: join(dirname(fileURLToPath(import.meta.url)), '../../../apps/api/.env'),
  override: true,
});
import { createDb } from './index.js';
import {
  profiles,
  sellers,
  userRoles,
  buyerAddresses,
  categories,
  foodItems,
  foodItemOptions,
  foodOptionGroups,
  laundryServices,
  sellerBankAccounts,
  banners,
  posts,
  orders,
  orderItems,
  orderStatusHistory,
  laundryOrderDetails,
} from './schema/index.js';
import { eq } from 'drizzle-orm';
import {
  DEMO_ORDERS,
  EXTRA_CATEGORIES,
  EXTRA_SELLERS,
  PENDING_SELLER,
  LAUNDRY_SELLER3_SERVICES,
  MAIN_SELLER_FOOD,
  SELLER2_FOOD,
  type SeedFoodItem,
} from './seed-data.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Demo1234';

function assertSeedAllowed() {
  const dbUrl = process.env.DATABASE_URL ?? '';
  const isLocalDb = /127\.0\.0\.1|localhost/.test(dbUrl);
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== '1') {
    throw new Error(
      'Từ chối db:seed khi NODE_ENV=production. Chỉ override bằng ALLOW_DEMO_SEED=1 khi cố ý seed staging.',
    );
  }
  if (!isLocalDb && process.env.ALLOW_DEMO_SEED !== '1') {
    throw new Error(
      'Từ chối db:seed với DATABASE_URL không phải localhost. Override: ALLOW_DEMO_SEED=1',
    );
  }
}

const demos = [
  { email: 'admin@demo.local', role: 'admin' as const, fullName: 'Quản trị viên' },
  { email: 'buyer@hcmut.edu.vn', role: 'buyer' as const, fullName: 'Nguyễn Minh An', phone: '0901234567' },
  { email: 'seller@demo.local', role: 'seller' as const, fullName: 'Trần Văn Hùng', phone: '0909876543' },
  ...EXTRA_SELLERS,
  PENDING_SELLER,
];

type Db = ReturnType<typeof createDb>['db'];

async function ensureAuthUser(
  // Chỉ dùng supabase.auth.admin — generics của schema không quan trọng ở đây.
  supabase: SupabaseClient<any, any, any>,
  email: string,
  fullName: string,
  role: string,
) {
  const { data: list } = await supabase.auth.admin.listUsers();
  const existing = list?.users?.find((u) => u.email === email);
  if (existing) {
    const patch: {
      email_confirm: boolean;
      user_metadata: { full_name: string; role: string };
      password?: string;
    } = {
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    };
    // Mặc định không ghi đè mật khẩu user đã có (tránh lock account nếu seed nhầm).
    if (process.env.RESET_DEMO_PASSWORDS === '1') {
      patch.password = DEMO_PASSWORD;
    }
    await supabase.auth.admin.updateUserById(existing.id, patch);
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error || !data.user) throw new Error(`Auth user ${email}: ${error?.message}`);
  return data.user.id;
}

async function ensureFoodItems(
  db: Db,
  sellerId: string,
  items: SeedFoodItem[],
  catIds: Record<string, string>,
) {
  for (const f of items) {
    const [existing] = await db.select().from(foodItems).where(eq(foodItems.name, f.name)).limit(1);
    if (existing) continue;
    await db.insert(foodItems).values({
      sellerId,
      categoryId: catIds[f.cat],
      name: f.name,
      description: f.desc,
      price: f.price,
      prepTimeMinutes: f.prep,
    });
  }
}

async function ensureLaundryServices(
  db: Db,
  sellerId: string,
  services: { name: string; price: string; unit: 'kg' | 'item'; hours: number }[],
) {
  for (const l of services) {
    const [existing] = await db
      .select()
      .from(laundryServices)
      .where(eq(laundryServices.name, l.name))
      .limit(1);
    if (existing) continue;
    await db.insert(laundryServices).values({
      sellerId,
      name: l.name,
      description: `Dịch vụ ${l.name.toLowerCase()}`,
      unit: l.unit,
      basePrice: l.price,
      estimatedTimeHours: l.hours,
      serviceAreas: ['KTX ĐHQG', 'Linh Trung', 'Thủ Đức'],
    });
  }
}

async function seedDemoOrders(
  db: Db,
  buyerId: string,
  sellerByEmail: Record<string, { id: string }>,
  deliveryAddress: Record<string, unknown>,
) {
  for (const spec of DEMO_ORDERS) {
    const [existing] = await db.select().from(orders).where(eq(orders.orderCode, spec.orderCode)).limit(1);
    if (existing) {
      if (spec.foodItems) {
        const existingItems = await db.select().from(orderItems).where(eq(orderItems.orderId, existing.id));
        if (existingItems.length === 0) {
          for (const item of spec.foodItems) {
            await db.insert(orderItems).values({
              orderId: existing.id,
              itemName: item.name,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              lineTotal: item.lineTotal,
            });
          }
        }
      }
      if (spec.laundry) {
        const [existingLaundry] = await db
          .select()
          .from(laundryOrderDetails)
          .where(eq(laundryOrderDetails.orderId, existing.id))
          .limit(1);
        if (!existingLaundry) {
          await db.insert(laundryOrderDetails).values({
            orderId: existing.id,
            serviceName: spec.laundry.serviceName,
            estimatedQty: spec.laundry.estimatedQty,
            estimatedUnit: spec.laundry.estimatedUnit,
            actualQty: spec.laundry.actualQty,
            unitPrice: spec.laundry.unitPrice,
            surcharge: spec.laundry.surcharge,
            finalPrice: spec.laundry.finalPrice,
          });
        }
      }
      continue;
    }

    const seller = sellerByEmail[spec.sellerEmail];
    if (!seller) continue;

    const [order] = await db
      .insert(orders)
      .values({
        orderCode: spec.orderCode,
        type: spec.type,
        buyerId,
        sellerId: seller.id,
        status: spec.status,
        paymentMethod: spec.paymentMethod ?? 'cash',
        paymentStatus: (spec.paymentStatus ?? 'unpaid') as 'unpaid' | 'pending' | 'paid',
        subtotal: spec.subtotal,
        total: spec.total,
        recipientName: 'Nguyễn Minh An',
        recipientPhone: '0901234567',
        deliveryAddress: spec.type === 'food' ? deliveryAddress : null,
        pickupAddress: spec.type === 'laundry' ? deliveryAddress : null,
        returnAddress: spec.type === 'laundry' ? deliveryAddress : null,
        pickupScheduledAt: spec.type === 'laundry' ? new Date(Date.now() + 86400000) : null,
        cancelReason: spec.cancelReason ?? null,
        completedAt: spec.completed ? new Date() : null,
      })
      .returning();

    if (spec.foodItems) {
      for (const item of spec.foodItems) {
        await db.insert(orderItems).values({
          orderId: order.id,
          itemName: item.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        });
      }
    }

    if (spec.laundry) {
      await db.insert(laundryOrderDetails).values({
        orderId: order.id,
        serviceName: spec.laundry.serviceName,
        estimatedQty: spec.laundry.estimatedQty,
        estimatedUnit: spec.laundry.estimatedUnit,
        actualQty: spec.laundry.actualQty ?? null,
        unitPrice: spec.laundry.unitPrice ?? null,
        surcharge: spec.laundry.surcharge ?? '0',
        finalPrice: spec.laundry.finalPrice ?? null,
      });
    }

    for (const h of spec.history ?? [{ fromStatus: null, toStatus: spec.status }]) {
      await db.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actorId: buyerId,
        actorRole: 'buyer',
      });
    }
  }
}

async function main() {
  assertSeedAllowed();
  const { db, client } = createDb(DATABASE_URL);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('🌱 Seeding local data...');

  const userIds: Record<string, string> = {};
  for (const d of demos) {
    const id = await ensureAuthUser(supabase, d.email, d.fullName, d.role);
    userIds[d.email] = id;

    const [existing] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
    if (!existing) {
      await db.insert(profiles).values({
        id,
        email: d.email,
        role: d.role,
        status: 'active',
        fullName: d.fullName,
        phone: 'phone' in d ? d.phone : null,
      });
    } else {
      await db
        .update(profiles)
        .set({ status: 'active', fullName: d.fullName, updatedAt: new Date() })
        .where(eq(profiles.id, id));
    }

    await db.insert(userRoles).values({ userId: id, role: d.role }).onConflictDoNothing();
  }

  const sellerByEmail: Record<string, { id: string; userId: string }> = {};

  let [seller] = await db
    .select()
    .from(sellers)
    .where(eq(sellers.userId, userIds['seller@demo.local']!))
    .limit(1);
  if (!seller) {
    [seller] = await db
      .insert(sellers)
      .values({
        userId: userIds['seller@demo.local']!,
        shopName: 'Cơm Sinh Viên',
        serviceTypes: 'food',
        businessAddress: 'KTX ĐHQG, Phường Linh Trung, TP.Thủ Đức',
        description: 'Cơm tấm, cơm gà và đồ uống — giao quanh KTX',
        serviceAreas: ['KTX A', 'KTX B', 'Làng ĐHQG'],
        avgDeliveryMinutes: 25,
        status: 'approved',
        approvedAt: new Date(),
      })
      .returning();
  } else {
    await db
      .update(sellers)
      .set({
        shopName: 'Cơm Sinh Viên',
        status: 'approved',
        serviceTypes: 'food',
        serviceAreas: seller.serviceAreas?.length ? seller.serviceAreas : ['KTX A', 'KTX B', 'Làng ĐHQG'],
        avgDeliveryMinutes: seller.avgDeliveryMinutes ?? 25,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sellers.id, seller.id));
  }
  sellerByEmail['seller@demo.local'] = seller;

  for (const extra of EXTRA_SELLERS) {
    const uid = userIds[extra.email];
    if (!uid) continue;
    let [row] = await db.select().from(sellers).where(eq(sellers.userId, uid)).limit(1);
    if (!row) {
      [row] = await db
        .insert(sellers)
        .values({
          userId: uid,
          shopName: extra.shopName,
          serviceTypes: extra.serviceTypes,
          businessAddress: extra.businessAddress,
          description: extra.description,
          serviceAreas: extra.serviceAreas,
          avgDeliveryMinutes: extra.avgDeliveryMinutes,
          status: 'approved',
          approvedAt: new Date(),
        })
        .returning();
    } else if (!row.serviceAreas?.length || row.avgDeliveryMinutes == null) {
      await db
        .update(sellers)
        .set({
          serviceAreas: row.serviceAreas?.length ? row.serviceAreas : extra.serviceAreas,
          avgDeliveryMinutes: row.avgDeliveryMinutes ?? extra.avgDeliveryMinutes,
          updatedAt: new Date(),
        })
        .where(eq(sellers.id, row.id));
      [row] = await db.select().from(sellers).where(eq(sellers.id, row.id)).limit(1);
    }
    sellerByEmail[extra.email] = row;
  }

  const pendingUid = userIds[PENDING_SELLER.email];
  if (pendingUid) {
    let [pendingRow] = await db.select().from(sellers).where(eq(sellers.userId, pendingUid)).limit(1);
    if (!pendingRow) {
      [pendingRow] = await db
        .insert(sellers)
        .values({
          userId: pendingUid,
          shopName: PENDING_SELLER.shopName,
          serviceTypes: PENDING_SELLER.serviceTypes,
          businessAddress: PENDING_SELLER.businessAddress,
          description: PENDING_SELLER.description,
          status: 'pending',
        })
        .returning();
    } else {
      await db
        .update(sellers)
        .set({ status: 'pending', approvedAt: null, updatedAt: new Date() })
        .where(eq(sellers.id, pendingRow.id));
    }
  }

  const buyerId = userIds['buyer@hcmut.edu.vn']!;
  let [addr] = await db.select().from(buyerAddresses).where(eq(buyerAddresses.userId, buyerId)).limit(1);
  if (!addr) {
    [addr] = await db
      .insert(buyerAddresses)
      .values({
        userId: buyerId,
        recipientName: 'Nguyễn Minh An',
        phone: '0901234567',
        detail: 'KTX khu A',
        dormName: 'KTX ĐHQG',
        roomNumber: 'toa',
        addressType: 'dorm',
        isDefault: true,
      })
      .returning();
  }

  const catData = [
    { name: 'Cơm', slug: 'com', type: 'food' as const },
    { name: 'Đồ uống', slug: 'do-uong', type: 'food' as const },
    { name: 'Giặt ủi', slug: 'giat-ui', type: 'laundry' as const },
    ...EXTRA_CATEGORIES,
  ];
  const catIds: Record<string, string> = {};
  for (const c of catData) {
    let [row] = await db.select().from(categories).where(eq(categories.slug, c.slug)).limit(1);
    if (!row) {
      [row] = await db.insert(categories).values(c).returning();
    }
    catIds[c.slug] = row.id;
  }

  const foodData = [
    { name: 'Cơm tấm sườn bì', price: '35000', desc: 'Sườn nướng + bì + trứng', cat: 'com', prep: 15 },
    { name: 'Cơm gà xối mỡ', price: '40000', desc: 'Gà giòn da, cơm thơm', cat: 'com', prep: 20 },
    { name: 'Trà đào', price: '15000', desc: 'Trà đào mát lạnh', cat: 'do-uong', prep: 5 },
    { name: 'Trà sữa trân châu', price: '25000', desc: 'Size M', cat: 'do-uong', prep: 10 },
  ];

  for (const f of foodData) {
    const [existing] = await db.select().from(foodItems).where(eq(foodItems.name, f.name)).limit(1);
    if (!existing) {
      const [item] = await db
        .insert(foodItems)
        .values({
          sellerId: seller.id,
          categoryId: catIds[f.cat],
          name: f.name,
          description: f.desc,
          price: f.price,
          prepTimeMinutes: f.prep,
        })
        .returning();
      if (f.name.includes('Cơm tấm')) {
        const [sizeGroup] = await db
          .insert(foodOptionGroups)
          .values({
            foodItemId: item.id,
            name: 'Size cơm',
            required: true,
            minSelect: 1,
            maxSelect: 1,
            sortOrder: 0,
          })
          .returning();
        await db.insert(foodItemOptions).values([
          { foodItemId: item.id, groupId: sizeGroup.id, name: 'Size thường', priceDelta: '0', sortOrder: 0 },
          { foodItemId: item.id, groupId: sizeGroup.id, name: 'Size đặc biệt', priceDelta: '10000', sortOrder: 1 },
        ]);
        const [topGroup] = await db
          .insert(foodOptionGroups)
          .values({
            foodItemId: item.id,
            name: 'Topping thêm',
            required: false,
            minSelect: 0,
            maxSelect: 2,
            sortOrder: 1,
          })
          .returning();
        await db.insert(foodItemOptions).values([
          { foodItemId: item.id, groupId: topGroup.id, name: 'Thêm trứng', priceDelta: '5000', sortOrder: 0 },
          { foodItemId: item.id, groupId: topGroup.id, name: 'Thêm sườn', priceDelta: '15000', sortOrder: 1 },
        ]);
      }
    }
  }

  await ensureFoodItems(db, seller.id, MAIN_SELLER_FOOD, catIds);

  const seller2 = sellerByEmail['food.seller2@demo.local'];
  if (seller2) await ensureFoodItems(db, seller2.id, SELLER2_FOOD, catIds);

  const seller3 = sellerByEmail['laundry.seller3@demo.local'];
  if (seller3) await ensureLaundryServices(db, seller3.id, LAUNDRY_SELLER3_SERVICES);

  const [bank] = await db
    .select()
    .from(sellerBankAccounts)
    .where(eq(sellerBankAccounts.sellerId, seller.id))
    .limit(1);
  if (!bank) {
    await db.insert(sellerBankAccounts).values({
      sellerId: seller.id,
      bankName: 'Vietcombank',
      accountNumber: '0123456789',
      accountHolder: 'COM SINH VIEN',
      isDefault: true,
    });
  }

  const [banner] = await db.select().from(banners).limit(1);
  if (!banner) {
    await db.insert(banners).values({
      title: 'Ăn uống – Giặt sạch',
      subtitle: 'Giao tại tòa / rào quanh Làng ĐH',
      linkUrl: '/food',
      ctaLabel: 'Đặt món ngay',
      sortOrder: 0,
      isActive: true,
      isPopup: false,
    });
  }

  const popupCount = await db.select({ id: banners.id }).from(banners).where(eq(banners.isPopup, true)).limit(1);
  if (popupCount.length === 0) {
    await db.insert(banners).values({
      title: 'Ưu đãi đơn đầu',
      subtitle: 'Đặt trên web quanh Làng ĐH — nhận ưu đãi khi có chương trình',
      linkUrl: '/food',
      ctaLabel: 'Xem món',
      sortOrder: 0,
      isActive: true,
      isPopup: true,
    });
  }

  const existingPosts = await db.select({ id: posts.id }).from(posts).limit(1);
  if (existingPosts.length === 0) {
    const mainSeller = sellerByEmail['seller@demo.local'];
    const foodSeller = sellerByEmail['food.seller2@demo.local'];
    const now = new Date();
    await db.insert(posts).values([
      {
        sellerId: null,
        title: 'Chào mừng đến langdaihoc',
        body: 'Đặt đồ ăn · giặt đồ · nhận ship hộ trong một ứng dụng. Chọn món, đặt lịch, theo dõi đơn realtime.',
        ctaLabel: 'Khám phá món ngon',
        linkUrl: '/food',
        status: 'published',
        isPinned: true,
        publishedAt: now,
      },
      {
        sellerId: null,
        title: 'Nhận ship hộ quanh KTX',
        body: 'Có đồ Shopee/Lazada cần nhận hộ? Đăng yêu cầu, shipper quanh làng nhận giúp.\n\nLưu ý: thanh toán trực tiếp với người nhận hộ theo thỏa thuận.',
        ctaLabel: 'Nhận ship hộ',
        linkUrl: '/ship',
        status: 'published',
        isPinned: false,
        publishedAt: now,
      },
      ...(mainSeller
        ? [
            {
              sellerId: mainSeller.id,
              title: 'Xôi xéo · xôi mặn — giao KTX B',
              body: 'Vòng quanh Làng ĐH thứ 6 (6h30–14h).\n\nQuán nhận tiền mặt hoặc chuyển khoản trực tiếp cho shipper.\n\nMón mới: xôi mặn chả trứng kho — 25k.',
              ctaLabel: 'Đặt ngay',
              linkUrl: `/store/${mainSeller.id}`,
              status: 'published' as const,
              isPinned: false,
              publishedAt: now,
            },
          ]
        : []),
      ...(foodSeller
        ? [
            {
              sellerId: foodSeller.id,
              title: 'Trà sữa size M giảm 10k',
              body: 'Ưu đãi trong ngày. Đặt trên web để giữ suất.',
              ctaLabel: 'Đặt ngay',
              linkUrl: `/store/${foodSeller.id}`,
              status: 'published' as const,
              isPinned: false,
              publishedAt: now,
            },
          ]
        : []),
    ]);
  }

  await seedDemoOrders(db, buyerId, sellerByEmail, addr);

  const allFood = await db.select({ id: foodItems.id }).from(foodItems);
  const allOrders = await db.select({ id: orders.id }).from(orders);
  const sellerCount = Object.keys(sellerByEmail).length;

  console.log('✅ Local seed complete!');
  console.log(`   ${sellerCount} sellers · ${allFood.length} món · ${allOrders.length} đơn`);
  console.log('');
  console.log(`Tài khoản local (mật khẩu: ${DEMO_PASSWORD}):`);
  console.log('  Buyer:  buyer@hcmut.edu.vn');
  console.log('  Seller: seller@demo.local');
  console.log('  Ăn uống: food.seller2@demo.local');
  console.log('  Laundry: laundry.seller3@demo.local');
  console.log('  Ship hộ: ship.seller4@demo.local');
  console.log('  Admin:  admin@demo.local');
  console.log('  Pending seller (admin duyệt): pending.seller@demo.local');

  // Enable Supabase Realtime cho bảng notifications
  try {
    await client.unsafe(`ALTER TABLE IF EXISTS public.notifications REPLICA IDENTITY FULL`);
    await client.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = 'notifications'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
        END IF;
      END $$
    `);
    console.log('   ✓ Realtime enabled for notifications table');
  } catch (e) {
    console.warn('   ⚠ Could not enable Realtime (not critical):', (e as Error).message);
  }

  await client.end({ timeout: 5 });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
