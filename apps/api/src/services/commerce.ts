import type { Database, DbConn } from '@langdaihoc/database';
import { eq, and, desc, sql, inArray, ilike, or, count, isNull, isNotNull, lte, gte } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import {
  foodItems,
  foodItemOptions,
  foodOptionGroups,
  laundryServices,
  sellers,
  categories,
  carts,
  cartItems,
  orders,
  orderItems,
  laundryOrderDetails,
  shipProxyOrderDetails,
  orderStatusHistory,
  paymentProofs,
  reviews,
  complaints,
  notifications,
  banners,
  posts,
  buyerAddresses,
  sellerBankAccounts,
  profiles,
  checkoutIdempotencyKeys,
  sellerDailyStats,
  sellerCounters,
  buyerCounters,
} from '@langdaihoc/database';
import { canActorTransition, canTransitionFood, canTransitionLaundry, canTransitionShipProxy, formatOrderSummary, orderStatusLabel, SHIP_PROXY_FEE_VND } from '@langdaihoc/shared';
import { AppError } from '../middleware/error-handler.js';
import { getBillingPeriodStartedAt } from '../lib/billing-period.js';
import { refreshOrderCounters, recordOrderCompleted, bumpUnreadForUser } from './counters.js';

export function generateOrderCode(type: 'food' | 'laundry' | 'ship_proxy') {
  const prefix = type === 'food' ? 'FD' : type === 'laundry' ? 'LD' : 'SP';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = cryptoRandom(8);
  return `${prefix}-${date}-${rand}`;
}

function cryptoRandom(len: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

function isPgUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === '23505');
}

export { isPgUniqueViolation };

/** Race: unique key → transaction rollback; đọc lại đơn đã thắng. */
async function resolveIdempotentOrder(db: Database, buyerId: string, idempotencyKey: string) {
  const [existingKey] = await db
    .select()
    .from(checkoutIdempotencyKeys)
    .where(and(eq(checkoutIdempotencyKeys.userId, buyerId), eq(checkoutIdempotencyKeys.key, idempotencyKey)))
    .limit(1);
  if (!existingKey) return null;
  const [existingOrder] = await db.select().from(orders).where(eq(orders.id, existingKey.orderId)).limit(1);
  if (!existingOrder) return null;
  const [enriched] = await enrichOrdersList(db, [existingOrder], { includeDetails: true });
  return enriched ?? existingOrder;
}

/**
 * Ghi thông báo và tăng bộ đếm chưa đọc trong cùng một transaction — lệch giữa hai
 * bước này làm badge sai vĩnh viễn vì không có job đối soát định kỳ.
 */
export async function notifyUser(
  db: DbConn,
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(notifications).values({
      userId,
      type,
      title,
      body,
      data: data ?? null,
      createdAt: now,
    });
    await bumpUnreadForUser(tx, userId, now);
  });
}

export async function getApprovedSellers(
  db: Database,
  serviceType?: 'food' | 'laundry' | 'ship_proxy',
  opts?: { limit?: number },
) {
  const conditions = [eq(sellers.status, 'approved'), eq(sellers.acceptingOrders, true)];
  if (serviceType) conditions.push(eq(sellers.serviceTypes, serviceType));
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 200);

  return db
    .select({
      id: sellers.id,
      shopName: sellers.shopName,
      serviceTypes: sellers.serviceTypes,
      businessAddress: sellers.businessAddress,
      description: sellers.description,
      avatarUrl: sellers.avatarUrl,
      phone: sellers.phone,
      openHours: sellers.openHours,
      operatingWindows: sellers.operatingWindows,
      laundryMinReturnGapMinutes: sellers.laundryMinReturnGapMinutes,
      minDeliveryWindowMinutes: sellers.minDeliveryWindowMinutes,
      serviceAreas: sellers.serviceAreas,
      avgDeliveryMinutes: sellers.avgDeliveryMinutes,
      shipProxyFee: sellers.shipProxyFee,
    })
    .from(sellers)
    .where(and(...conditions))
    .limit(limit);
}

export async function getApprovedSellerById(db: Database, sellerId: string) {
  const [row] = await db
    .select({
      id: sellers.id,
      shopName: sellers.shopName,
      serviceTypes: sellers.serviceTypes,
      businessAddress: sellers.businessAddress,
      description: sellers.description,
      avatarUrl: sellers.avatarUrl,
      phone: sellers.phone,
      openHours: sellers.openHours,
      operatingWindows: sellers.operatingWindows,
      laundryMinReturnGapMinutes: sellers.laundryMinReturnGapMinutes,
      minDeliveryWindowMinutes: sellers.minDeliveryWindowMinutes,
      serviceAreas: sellers.serviceAreas,
      avgDeliveryMinutes: sellers.avgDeliveryMinutes,
      shipProxyFee: sellers.shipProxyFee,
    })
    .from(sellers)
    .where(
      and(
        eq(sellers.id, sellerId),
        eq(sellers.status, 'approved'),
        eq(sellers.acceptingOrders, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function loadFoodItemExtras(db: DbConn, itemIds: string[]) {
  if (itemIds.length === 0) return { groups: [] as (typeof foodOptionGroups.$inferSelect)[], options: [] as (typeof foodItemOptions.$inferSelect)[] };
  const groups = await db
    .select()
    .from(foodOptionGroups)
    .where(inArray(foodOptionGroups.foodItemId, itemIds))
    .orderBy(foodOptionGroups.sortOrder, foodOptionGroups.id);
  const options = await db
    .select()
    .from(foodItemOptions)
    .where(inArray(foodItemOptions.foodItemId, itemIds))
    .orderBy(foodItemOptions.sortOrder, foodItemOptions.id);
  return { groups, options };
}

export function mapFoodItemExtras(
  itemId: string,
  groups: (typeof foodOptionGroups.$inferSelect)[],
  options: (typeof foodItemOptions.$inferSelect)[],
) {
  const itemGroups = [...groups.filter((g) => g.foodItemId === itemId)].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  const itemOptions = [...options.filter((o) => o.foodItemId === itemId)].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  type FoodOptionRow = typeof foodItemOptions.$inferSelect;
  const mapOpt = (o: FoodOptionRow) => ({
    id: o.id,
    name: o.name,
    priceDelta: Number(o.priceDelta),
    groupId: o.groupId,
    sortOrder: o.sortOrder,
  });

  if (itemGroups.length === 0) {
    const flat = itemOptions.map(mapOpt);
    const optionGroups =
      flat.length > 0
        ? [
            {
              id: 'optional',
              name: 'Tùy chọn thêm',
              required: false,
              minSelect: 0,
              maxSelect: flat.length,
              options: flat,
            },
          ]
        : [];
    return { optionGroups, options: flat };
  }

  const optionGroups = itemGroups.map((g) => ({
    id: g.id,
    name: g.name,
    required: g.required,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    sortOrder: g.sortOrder,
    options: itemOptions.filter((o) => o.groupId === g.id).map(mapOpt),
  }));
  return { optionGroups, options: itemOptions.map(mapOpt) };
}

export type CartOptionSnapshot = { id: string; name: string; priceDelta: number };

/** Khóa so khớp dòng giỏ: cùng món + cùng tập option id (không phụ thuộc thứ tự chọn). */
export function cartOptionIdsKey(options: { id?: string }[] | null | undefined): string {
  if (!options?.length) return '';
  return options
    .map((o) => o.id)
    .filter((id): id is string => Boolean(id))
    .sort()
    .join(',');
}

/** Validate lựa chọn + trả về name/priceDelta lấy từ DB (không tin client). */
export async function resolveFoodItemOptions(
  db: DbConn,
  foodItemId: string,
  selected: { id: string }[],
): Promise<CartOptionSnapshot[]> {
  const { groups, options } = await loadFoodItemExtras(db, [foodItemId]);
  return resolveFoodItemOptionsFromExtras(foodItemId, selected, groups, options);
}

/** Validate options in-memory từ extras đã load sẵn (tránh N+1 trên cart). */
export function resolveFoodItemOptionsFromExtras(
  foodItemId: string,
  selected: { id: string }[],
  groups: (typeof foodOptionGroups.$inferSelect)[],
  options: (typeof foodItemOptions.$inferSelect)[],
): CartOptionSnapshot[] {
  const { optionGroups } = mapFoodItemExtras(foodItemId, groups, options);
  const selectedIds = new Set(selected.map((o) => o.id));
  const byId = new Map(options.filter((o) => o.foodItemId === foodItemId).map((o) => [o.id, o]));

  for (const id of selectedIds) {
    if (!byId.has(id)) {
      throw new AppError(400, 'Tùy chọn không hợp lệ', 'INVALID_OPTIONS');
    }
  }

  for (const group of optionGroups) {
    if (group.id === 'optional') continue;
    const picked = group.options.filter((o) => selectedIds.has(o.id)).length;
    if (group.required && picked < Math.max(1, group.minSelect)) {
      throw new AppError(400, `Vui lòng chọn "${group.name}"`, 'OPTIONS_REQUIRED');
    }
    if (picked < group.minSelect) {
      throw new AppError(400, `Chọn tối thiểu ${group.minSelect} trong "${group.name}"`, 'OPTIONS_MIN');
    }
    if (picked > group.maxSelect) {
      throw new AppError(400, `Chọn tối đa ${group.maxSelect} trong "${group.name}"`, 'OPTIONS_MAX');
    }
  }

  // Giữ đúng thứ tự catalog: nhóm → option (không theo thứ tự user bấm)
  const ordered: CartOptionSnapshot[] = [];
  const used = new Set<string>();
  for (const group of optionGroups) {
    for (const o of group.options) {
      if (!selectedIds.has(o.id) || used.has(o.id)) continue;
      ordered.push({ id: o.id, name: o.name, priceDelta: o.priceDelta });
      used.add(o.id);
    }
  }
  for (const id of selectedIds) {
    if (used.has(id)) continue;
    const o = byId.get(id);
    if (o) ordered.push({ id: o.id, name: o.name, priceDelta: Number(o.priceDelta) });
  }
  return ordered;
}

export interface FoodCatalogParams {
  sellerId?: string;
  categorySlug?: string;
  page?: number;
  limit?: number;
  q?: string;
  /** List card chỉ cần tên/giá/ảnh — topping lấy khi mở món. */
  includeOptions?: boolean;
}

function normalizeFoodImages(imageUrl: string | null, imageUrls: unknown): string[] {
  const fromArr = Array.isArray(imageUrls)
    ? imageUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0).map((u) => u.trim())
    : [];
  const out = [...fromArr];
  if (imageUrl?.trim() && !out.includes(imageUrl.trim())) out.unshift(imageUrl.trim());
  return out.slice(0, 10);
}

export async function getFoodCatalog(db: Database, params: FoodCatalogParams = {}) {
  const { sellerId, categorySlug, q, includeOptions = false } = params;
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;

  let categoryId: string | undefined;
  if (categorySlug) {
    const [cat] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.slug, categorySlug), eq(categories.isActive, true)))
      .limit(1);
    if (!cat) {
      return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
    }
    categoryId = cat.id;
  }

  const conditions = [eq(foodItems.isAvailable, true), eq(sellers.status, 'approved'), eq(sellers.acceptingOrders, true)];
  if (sellerId) conditions.push(eq(foodItems.sellerId, sellerId));
  if (categoryId) conditions.push(eq(foodItems.categoryId, categoryId));
  if (q?.trim()) {
    const escaped = q.trim().replace(/[%_\\]/g, '\\$&');
    const term = `%${escaped}%`;
    conditions.push(or(ilike(foodItems.name, term), ilike(sellers.shopName, term))!);
  }

  const where = and(...conditions);

  const [countRow] = await db
    .select({ total: count() })
    .from(foodItems)
    .innerJoin(sellers, eq(foodItems.sellerId, sellers.id))
    .where(where);

  const items = await db
    .select({
      id: foodItems.id,
      sellerId: foodItems.sellerId,
      shopName: sellers.shopName,
      categoryId: foodItems.categoryId,
      name: foodItems.name,
      description: foodItems.description,
      price: foodItems.price,
      prepTimeMinutes: foodItems.prepTimeMinutes,
      imageUrl: foodItems.imageUrl,
      imageUrls: foodItems.imageUrls,
    })
    .from(foodItems)
    .innerJoin(sellers, eq(foodItems.sellerId, sellers.id))
    .where(where)
    .orderBy(foodItems.sortOrder)
    .limit(limit)
    .offset(offset);

  const itemIds = items.map((i) => i.id);
  const extrasBundle = includeOptions
    ? await loadFoodItemExtras(db, itemIds)
    : { groups: [] as (typeof foodOptionGroups.$inferSelect)[], options: [] as (typeof foodItemOptions.$inferSelect)[] };

  const data = items.map((item) => {
    const extras = includeOptions
      ? mapFoodItemExtras(item.id, extrasBundle.groups, extrasBundle.options)
      : { optionGroups: [] as ReturnType<typeof mapFoodItemExtras>['optionGroups'], options: [] as ReturnType<typeof mapFoodItemExtras>['options'] };
    const images = normalizeFoodImages(item.imageUrl, item.imageUrls);
    return {
      ...item,
      price: Number(item.price),
      imageUrl: images[0] ?? item.imageUrl ?? null,
      imageUrls: images,
      ...extras,
    };
  });

  return {
    data,
    meta: { page, limit, total: Number(countRow?.total ?? 0) },
  };
}

/** Chi tiết 1 món + topping — dùng khi mở sheet đặt món. */
export async function getFoodItemPublic(db: Database, foodItemId: string) {
  const [item] = await db
    .select({
      id: foodItems.id,
      sellerId: foodItems.sellerId,
      shopName: sellers.shopName,
      categoryId: foodItems.categoryId,
      name: foodItems.name,
      description: foodItems.description,
      price: foodItems.price,
      prepTimeMinutes: foodItems.prepTimeMinutes,
      imageUrl: foodItems.imageUrl,
      imageUrls: foodItems.imageUrls,
    })
    .from(foodItems)
    .innerJoin(sellers, eq(foodItems.sellerId, sellers.id))
    .where(
      and(
        eq(foodItems.id, foodItemId),
        eq(foodItems.isAvailable, true),
        eq(sellers.status, 'approved'),
        eq(sellers.acceptingOrders, true),
      ),
    )
    .limit(1);
  if (!item) return null;

  const { groups, options } = await loadFoodItemExtras(db, [item.id]);
  const extras = mapFoodItemExtras(item.id, groups, options);
  const images = normalizeFoodImages(item.imageUrl, item.imageUrls);
  return {
    ...item,
    price: Number(item.price),
    imageUrl: images[0] ?? item.imageUrl ?? null,
    imageUrls: images,
    ...extras,
  };
}

export async function getLaundryCatalog(db: Database, sellerId?: string, opts?: { limit?: number }) {
  const conditions = [eq(laundryServices.isAvailable, true), eq(sellers.status, 'approved'), eq(sellers.acceptingOrders, true)];
  if (sellerId) conditions.push(eq(laundryServices.sellerId, sellerId));
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);

  const rows = await db
    .select({
      id: laundryServices.id,
      sellerId: laundryServices.sellerId,
      shopName: sellers.shopName,
      shopPhone: sellers.phone,
      shopAddress: sellers.businessAddress,
      shopOpenHours: sellers.openHours,
      shopOperatingWindows: sellers.operatingWindows,
      shopLaundryMinReturnGapMinutes: sellers.laundryMinReturnGapMinutes,
      name: laundryServices.name,
      description: laundryServices.description,
      unit: laundryServices.unit,
      basePrice: laundryServices.basePrice,
      estimatedTimeHours: laundryServices.estimatedTimeHours,
      serviceAreas: laundryServices.serviceAreas,
      imageUrl: laundryServices.imageUrl,
    })
    .from(laundryServices)
    .innerJoin(sellers, eq(laundryServices.sellerId, sellers.id))
    .where(and(...conditions))
    .limit(limit);

  return rows.map((r) => ({ ...r, basePrice: Number(r.basePrice) }));
}

export async function getOrCreateCart(db: DbConn, userId: string) {
  let [cart] = await db.select().from(carts).where(eq(carts.userId, userId)).limit(1);
  if (cart) return cart;
  try {
    [cart] = await db.insert(carts).values({ userId }).returning();
    return cart;
  } catch (err) {
    if (!isPgUniqueViolation(err)) throw err;
    [cart] = await db.select().from(carts).where(eq(carts.userId, userId)).limit(1);
    if (!cart) throw err;
    return cart;
  }
}

export async function getCartWithItems(db: DbConn, userId: string) {
  const cart = await getOrCreateCart(db, userId);
  const items = await db
    .select({
      id: cartItems.id,
      foodItemId: cartItems.foodItemId,
      quantity: cartItems.quantity,
      note: cartItems.note,
      optionsJson: cartItems.optionsJson,
      name: foodItems.name,
      price: foodItems.price,
      isAvailable: foodItems.isAvailable,
      sellerId: foodItems.sellerId,
      sellerStatus: sellers.status,
      sellerAcceptingOrders: sellers.acceptingOrders,
      shopName: sellers.shopName,
      sellerMinDeliveryWindowMinutes: sellers.minDeliveryWindowMinutes,
      sellerOperatingWindows: sellers.operatingWindows,
    })
    .from(cartItems)
    .innerJoin(foodItems, eq(cartItems.foodItemId, foodItems.id))
    .innerJoin(sellers, eq(foodItems.sellerId, sellers.id))
    .where(eq(cartItems.cartId, cart.id));

  const priced = [];
  const foodIds = [...new Set(items.map((i) => i.foodItemId))];
  const { groups, options: allOptions } = await loadFoodItemExtras(db, foodIds);

  for (const item of items) {
    const stored = (item.optionsJson ?? []) as { id?: string }[];
    const optionIds = stored.map((o) => o.id).filter((id): id is string => Boolean(id));
    let options: CartOptionSnapshot[] = [];
    let optionsValid = true;
    try {
      options = resolveFoodItemOptionsFromExtras(
        item.foodItemId,
        optionIds.map((id) => ({ id })),
        groups,
        allOptions,
      );
    } catch {
      optionsValid = false;
      const byId = new Map(
        allOptions.filter((o) => o.foodItemId === item.foodItemId).map((o) => [o.id, o]),
      );
      for (const id of optionIds) {
        const o = byId.get(id);
        if (o) options.push({ id: o.id, name: o.name, priceDelta: Number(o.priceDelta) });
      }
    }
    const optTotal = options.reduce((s, o) => s + o.priceDelta, 0);
    const unit = Number(item.price) + optTotal;
    priced.push({
      ...item,
      optionsJson: options,
      price: Number(item.price),
      lineTotal: unit * item.quantity,
      sellerApproved: item.sellerStatus === 'approved' && item.sellerAcceptingOrders,
      optionsValid,
    });
  }

  const subtotal = priced.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    cart,
    items: priced,
    subtotal,
    sellerId: cart.sellerId,
    shopName: priced[0]?.shopName ?? null,
    minDeliveryWindowMinutes: priced[0]?.sellerMinDeliveryWindowMinutes ?? 30,
    operatingWindows: priced[0]?.sellerOperatingWindows ?? null,
  };
}

export async function addToCart(
  db: Database,
  userId: string,
  foodItemId: string,
  quantity: number,
  note?: string,
  options?: { id: string }[],
  forceClear = false,
) {
  const qty = Math.min(Math.max(1, Math.floor(quantity)), 99);
  const [item] = await db
    .select({
      id: foodItems.id,
      sellerId: foodItems.sellerId,
      isAvailable: foodItems.isAvailable,
      sellerStatus: sellers.status,
      sellerAcceptingOrders: sellers.acceptingOrders,
    })
    .from(foodItems)
    .innerJoin(sellers, eq(foodItems.sellerId, sellers.id))
    .where(eq(foodItems.id, foodItemId))
    .limit(1);
  if (!item || !item.isAvailable) throw new AppError(404, 'Món không tồn tại', 'NOT_FOUND');
  if (item.sellerStatus !== 'approved' || !item.sellerAcceptingOrders) {
    throw new AppError(409, 'Cửa hàng hiện không nhận đơn', 'SELLER_UNAVAILABLE');
  }

  const resolvedOptions = await resolveFoodItemOptions(db, foodItemId, options ?? []);
  const incomingOptionKey = cartOptionIdsKey(resolvedOptions);

  await db.transaction(async (tx) => {
    const cart = await getOrCreateCart(tx, userId);
    await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cart.id)).for('update');

    const [locked] = await tx.select().from(carts).where(eq(carts.id, cart.id)).limit(1);
    if (!locked) throw new AppError(500, 'Không khóa được giỏ hàng', 'CART_LOCK_FAILED');

    if (locked.sellerId && locked.sellerId !== item.sellerId && !forceClear) {
      throw new AppError(
        409,
        'Giỏ hàng đang có món từ cửa hàng khác',
        'CART_SELLER_CONFLICT',
      );
    }

    if (forceClear || (locked.sellerId && locked.sellerId !== item.sellerId)) {
      await tx.delete(cartItems).where(eq(cartItems.cartId, locked.id));
    }

    await tx
      .update(carts)
      .set({ sellerId: item.sellerId, updatedAt: new Date() })
      .where(eq(carts.id, locked.id));

    const sameFoodRows = await tx
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, locked.id), eq(cartItems.foodItemId, foodItemId)));

    const existing = sameFoodRows.find(
      (row) => cartOptionIdsKey(row.optionsJson as { id?: string }[] | null) === incomingOptionKey,
    );

    if (existing) {
      const nextQty = Math.min(existing.quantity + qty, 99);
      await tx
        .update(cartItems)
        .set({
          quantity: nextQty,
          ...(note !== undefined && { note: note || null }),
        })
        .where(eq(cartItems.id, existing.id));
    } else {
      await tx.insert(cartItems).values({
        cartId: locked.id,
        foodItemId,
        quantity: qty,
        note: note || null,
        optionsJson: resolvedOptions.length ? resolvedOptions : null,
      });
    }
  });
}

export async function checkoutFood(
  db: Database,
  buyerId: string,
  data: {
    addressId: string;
    phone: string;
    paymentMethod: 'cash' | 'bank_transfer';
    desiredDeliveryAt?: string;
    desiredDeliveryUntil?: string;
    notes?: string;
  },
  idempotencyKey: string,
) {
  const runCheckout = async (conn: DbConn) => {
    const [profile] = await conn.select().from(profiles).where(eq(profiles.id, buyerId)).limit(1);
    if (!profile?.phone && !data.phone) {
      throw new AppError(400, 'Vui lòng thêm số điện thoại', 'PHONE_REQUIRED');
    }

    const [address] = await conn
      .select()
      .from(buyerAddresses)
      .where(and(eq(buyerAddresses.id, data.addressId), eq(buyerAddresses.userId, buyerId)))
      .limit(1);
    if (!address) throw new AppError(400, 'Địa chỉ không hợp lệ', 'INVALID_ADDRESS');

    /** Lock giỏ hàng để 2 tab checkout song song không tạo 2 đơn từ cùng giỏ. */
    const lockedCart = await getOrCreateCart(conn, buyerId);
    await conn
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.id, lockedCart.id))
      .for('update');

    const cartData = await getCartWithItems(conn, buyerId);
    if (cartData.items.length === 0) throw new AppError(400, 'Giỏ hàng trống', 'EMPTY_CART');

    const unavailable = cartData.items.filter((item) => !item.isAvailable);
    if (unavailable.length > 0) {
      throw new AppError(
        409,
        `Món đã hết hoặc bị ẩn: ${unavailable.map((i) => i.name).join(', ')}`,
        'ITEM_UNAVAILABLE',
      );
    }

    const unapproved = cartData.items.filter((item) => !item.sellerApproved);
    if (unapproved.length > 0) {
      throw new AppError(409, 'Cửa hàng hiện không nhận đơn', 'SELLER_UNAVAILABLE');
    }

    const badOptions = cartData.items.filter((item) => !item.optionsValid);
    if (badOptions.length > 0) {
      throw new AppError(
        409,
        `Tùy chọn món đã thay đổi, vui lòng xóa và thêm lại: ${badOptions.map((i) => i.name).join(', ')}`,
        'OPTIONS_STALE',
      );
    }

    const subtotal = cartData.subtotal;
    const orderCode = generateOrderCode('food');

    const desiredDeliveryAt = data.desiredDeliveryAt ? new Date(data.desiredDeliveryAt) : null;
    if (desiredDeliveryAt && Number.isNaN(desiredDeliveryAt.getTime())) {
      throw new AppError(400, 'Thời gian giao không hợp lệ', 'INVALID_DELIVERY_TIME');
    }
    let desiredDeliveryUntil = data.desiredDeliveryUntil ? new Date(data.desiredDeliveryUntil) : null;
    if (desiredDeliveryUntil && Number.isNaN(desiredDeliveryUntil.getTime())) {
      throw new AppError(400, 'Thời gian giao không hợp lệ', 'INVALID_DELIVERY_TIME');
    }
    const foodMinWindowMin = cartData.minDeliveryWindowMinutes ?? 30;
    // Client cũ / thiếu until → mặc định cửa sổ theo quy định quán.
    if (desiredDeliveryAt && !desiredDeliveryUntil) {
      desiredDeliveryUntil = new Date(desiredDeliveryAt.getTime() + foodMinWindowMin * 60 * 1000);
    }
    if (
      desiredDeliveryAt
      && desiredDeliveryUntil
      && desiredDeliveryUntil.getTime() < desiredDeliveryAt.getTime() + foodMinWindowMin * 60 * 1000
    ) {
      throw new AppError(
        400,
        `Khoảng giờ giao phải ít nhất ${foodMinWindowMin} phút`,
        'INVALID_DELIVERY_WINDOW',
      );
    }

    const [order] = await conn
      .insert(orders)
      .values({
        orderCode,
        type: 'food',
        buyerId,
        sellerId: cartData.sellerId!,
        status: 'pending',
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentMethod === 'cash' ? 'unpaid' : 'pending',
        subtotal: String(subtotal),
        total: String(subtotal),
        notes: data.notes,
        recipientName: address.recipientName,
        recipientPhone: data.phone || address.phone,
        deliveryAddress: address,
        desiredDeliveryAt,
        desiredDeliveryUntil,
      })
      .returning();

    const orderItemRows = cartData.items.map((item) => ({
      orderId: order.id,
      foodItemId: item.foodItemId,
      itemName: item.name,
      unitPrice: String(item.price),
      quantity: item.quantity,
      optionsSnapshot: item.optionsJson,
      note: item.note,
      lineTotal: String(item.lineTotal),
    }));
    if (orderItemRows.length) {
      await conn.insert(orderItems).values(orderItemRows);
    }
    const orderSummary = formatOrderSummary(
      'food',
      cartData.items.map((item) => ({ itemName: item.name, quantity: item.quantity })),
      null,
    );

    await conn.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: 'pending',
      actorId: buyerId,
      actorRole: 'buyer',
    });

    await conn.delete(cartItems).where(eq(cartItems.cartId, cartData.cart.id));
    await conn.update(carts).set({ sellerId: null, updatedAt: new Date() }).where(eq(carts.id, cartData.cart.id));

    const [seller] = await conn.select().from(sellers).where(eq(sellers.id, cartData.sellerId!)).limit(1);
    if (seller) {
      await notifyUser(conn, seller.userId, 'new_order', 'Có đơn mới', `${orderSummary || orderCode} cần xử lý`, {
        orderId: order.id,
      });
    }

    await refreshOrderCounters(conn, { sellerId: order.sellerId, buyerId });

    return { ...order, summary: orderSummary };
  };

  return db.transaction(async (tx) => {
    const [existingKey] = await tx
      .select()
      .from(checkoutIdempotencyKeys)
      .where(and(eq(checkoutIdempotencyKeys.userId, buyerId), eq(checkoutIdempotencyKeys.key, idempotencyKey)))
      .limit(1);
    if (existingKey) {
      const [existingOrder] = await tx.select().from(orders).where(eq(orders.id, existingKey.orderId)).limit(1);
      if (existingOrder) {
        const [enriched] = await enrichOrdersList(tx, [existingOrder], { includeDetails: true });
        return enriched ?? existingOrder;
      }
    }

    const order = await runCheckout(tx);
    await tx.insert(checkoutIdempotencyKeys).values({
      userId: buyerId,
      key: idempotencyKey,
      orderId: order.id,
    });
    return order;
  }).catch(async (err) => {
    if (!isPgUniqueViolation(err)) throw err;
    const existing = await resolveIdempotentOrder(db, buyerId, idempotencyKey);
    if (existing) return existing;
    throw err;
  });
}

export async function createLaundryOrder(
  db: Database,
  buyerId: string,
  data: {
    serviceId: string;
    estimatedQty?: number;
    pickupScheduledAt: string;
    returnScheduledAt?: string;
    pickupAddressId: string;
    returnAddressId: string;
    phone: string;
    notes?: string;
    paymentMethod: 'cash' | 'bank_transfer';
    autoConfirmQuote?: boolean;
  },
  idempotencyKey: string,
) {
  return db.transaction(async (tx) => {
    const [existingKey] = await tx
      .select()
      .from(checkoutIdempotencyKeys)
      .where(and(eq(checkoutIdempotencyKeys.userId, buyerId), eq(checkoutIdempotencyKeys.key, idempotencyKey)))
      .limit(1);
    if (existingKey) {
      const [existingOrder] = await tx.select().from(orders).where(eq(orders.id, existingKey.orderId)).limit(1);
      if (existingOrder) {
        const [enriched] = await enrichOrdersList(tx, [existingOrder], { includeDetails: true });
        return enriched ?? existingOrder;
      }
    }

    const [service] = await tx
      .select({
        id: laundryServices.id,
        sellerId: laundryServices.sellerId,
        name: laundryServices.name,
        unit: laundryServices.unit,
        basePrice: laundryServices.basePrice,
        isAvailable: laundryServices.isAvailable,
        sellerStatus: sellers.status,
        sellerAcceptingOrders: sellers.acceptingOrders,
        sellerUserId: sellers.userId,
        laundryMinReturnGapMinutes: sellers.laundryMinReturnGapMinutes,
      })
      .from(laundryServices)
      .innerJoin(sellers, eq(laundryServices.sellerId, sellers.id))
      .where(eq(laundryServices.id, data.serviceId))
      .limit(1);
    if (!service) throw new AppError(404, 'Dịch vụ không tồn tại', 'NOT_FOUND');
    if (!service.isAvailable) {
      throw new AppError(409, 'Dịch vụ hiện không nhận đơn', 'ITEM_UNAVAILABLE');
    }
    if (service.sellerStatus !== 'approved' || !service.sellerAcceptingOrders) {
      throw new AppError(409, 'Tiệm giặt hiện không nhận đơn', 'SELLER_UNAVAILABLE');
    }

    const [pickup] = await tx
      .select()
      .from(buyerAddresses)
      .where(and(eq(buyerAddresses.id, data.pickupAddressId), eq(buyerAddresses.userId, buyerId)))
      .limit(1);
    const [ret] = await tx
      .select()
      .from(buyerAddresses)
      .where(and(eq(buyerAddresses.id, data.returnAddressId), eq(buyerAddresses.userId, buyerId)))
      .limit(1);
    if (!pickup || !ret) throw new AppError(400, 'Địa chỉ không hợp lệ', 'INVALID_ADDRESS');

    const pickupAt = new Date(data.pickupScheduledAt);
    if (Number.isNaN(pickupAt.getTime())) {
      throw new AppError(400, 'Thời gian lấy đồ không hợp lệ', 'INVALID_TIME');
    }
    const returnAt = data.returnScheduledAt ? new Date(data.returnScheduledAt) : null;
    if (returnAt && Number.isNaN(returnAt.getTime())) {
      throw new AppError(400, 'Thời gian giao lại không hợp lệ', 'INVALID_TIME');
    }
    const laundryGapMin = service.laundryMinReturnGapMinutes ?? 60;
    if (returnAt && returnAt.getTime() < pickupAt.getTime() + laundryGapMin * 60 * 1000) {
      throw new AppError(
        400,
        `Giờ giao lại phải sau giờ lấy ít nhất ${laundryGapMin} phút`,
        'INVALID_TIME_RANGE',
      );
    }

    const qty = data.estimatedQty != null && data.estimatedQty > 0 ? data.estimatedQty : 1;
    const estimated = Number(service.basePrice) * qty;
    const orderCode = generateOrderCode('laundry');

    const [order] = await tx
      .insert(orders)
      .values({
        orderCode,
        type: 'laundry',
        buyerId,
        sellerId: service.sellerId,
        status: 'pending',
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentMethod === 'cash' ? 'unpaid' : 'pending',
        subtotal: String(estimated),
        total: String(estimated),
        notes: data.notes,
        recipientPhone: data.phone,
        pickupAddress: pickup,
        returnAddress: ret,
        pickupScheduledAt: pickupAt,
        desiredDeliveryAt: returnAt,
      })
      .returning();

    await tx.insert(laundryOrderDetails).values({
      orderId: order.id,
      serviceId: service.id,
      serviceName: service.name,
      estimatedQty: String(qty),
      estimatedUnit: service.unit,
      autoConfirmQuote: !!data.autoConfirmQuote,
    });

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      toStatus: 'pending',
      actorId: buyerId,
      actorRole: 'buyer',
    });

    const orderSummary = formatOrderSummary('laundry', [], {
      serviceName: service.name,
      estimatedQty: String(qty),
      estimatedUnit: service.unit,
    });

    await notifyUser(tx, service.sellerUserId, 'new_order', 'Đơn giặt mới', orderSummary, {
      orderId: order.id,
    });

    await refreshOrderCounters(tx, { sellerId: order.sellerId, buyerId });

    await tx.insert(checkoutIdempotencyKeys).values({
      userId: buyerId,
      key: idempotencyKey,
      orderId: order.id,
    });

    return { ...order, summary: orderSummary };
  }).catch(async (err) => {
    if (!isPgUniqueViolation(err)) throw err;
    const existing = await resolveIdempotentOrder(db, buyerId, idempotencyKey);
    if (existing) return existing;
    throw err;
  });
}

export async function createShipProxyOrder(
  db: Database,
  buyerId: string,
  data: {
    sellerId: string;
    trackingCode: string;
    pickupLocation: string;
    pickupAt: string;
    receivePhone: string;
    returnAt: string;
    returnAddressText: string;
    contactPhone: string;
    packageValue: number;
    notes?: string;
  },
  idempotencyKey: string,
) {
  return db.transaction(async (tx) => {
    const [existingKey] = await tx
      .select()
      .from(checkoutIdempotencyKeys)
      .where(and(eq(checkoutIdempotencyKeys.userId, buyerId), eq(checkoutIdempotencyKeys.key, idempotencyKey)))
      .limit(1);
    if (existingKey) {
      const [existingOrder] = await tx.select().from(orders).where(eq(orders.id, existingKey.orderId)).limit(1);
      if (existingOrder) {
        const [enriched] = await enrichOrdersList(tx, [existingOrder], { includeDetails: true });
        return enriched ?? existingOrder;
      }
    }

    const [seller] = await tx
      .select()
      .from(sellers)
      .where(
        and(
          eq(sellers.id, data.sellerId),
          eq(sellers.serviceTypes, 'ship_proxy'),
          eq(sellers.status, 'approved'),
          eq(sellers.acceptingOrders, true),
        ),
      )
      .limit(1);
    if (!seller) throw new AppError(404, 'Người nhận đồ ship hộ không tồn tại hoặc hiện không nhận đơn', 'NOT_FOUND');

    const pickupAt = new Date(data.pickupAt);
    const returnAt = new Date(data.returnAt);
    if (Number.isNaN(pickupAt.getTime()) || Number.isNaN(returnAt.getTime())) {
      throw new AppError(400, 'Thời gian không hợp lệ', 'INVALID_TIME');
    }
    const SHIP_GAP_MIN = 30;
    if (returnAt.getTime() < pickupAt.getTime() + SHIP_GAP_MIN * 60 * 1000) {
      throw new AppError(
        400,
        'Giờ nhận lại phải sau giờ lấy ít nhất 30 phút',
        'INVALID_TIME_RANGE',
      );
    }

    const packageValue = Math.round(Number(data.packageValue));
    if (!Number.isFinite(packageValue) || packageValue <= 0) {
      throw new AppError(400, 'Giá tiền hàng nhận hộ không hợp lệ', 'INVALID_PACKAGE_VALUE');
    }

    const fee = Math.max(0, Number(seller.shipProxyFee ?? SHIP_PROXY_FEE_VND));
    if (!Number.isFinite(fee) || fee <= 0) {
      throw new AppError(409, 'Người nhận hộ chưa cấu hình phí hợp lệ', 'FEE_NOT_SET');
    }
    const total = packageValue + fee;

    const orderCode = generateOrderCode('ship_proxy');
    const [order] = await tx
      .insert(orders)
      .values({
        orderCode,
        type: 'ship_proxy',
        buyerId,
        sellerId: seller.id,
        status: 'pending',
        paymentMethod: 'bank_transfer',
        paymentStatus: 'pending',
        subtotal: String(total),
        total: String(total),
        notes: data.notes,
        recipientPhone: data.contactPhone,
        pickupScheduledAt: pickupAt,
        desiredDeliveryAt: returnAt,
        returnAddress: { detail: data.returnAddressText },
      })
      .returning();

    await tx.insert(shipProxyOrderDetails).values({
      orderId: order.id,
      trackingCode: data.trackingCode.trim(),
      pickupLocation: data.pickupLocation.trim(),
      pickupAt,
      receivePhone: data.receivePhone.trim(),
      returnAt,
      returnAddressText: data.returnAddressText.trim(),
      contactPhone: data.contactPhone.trim(),
      packageValue: String(packageValue),
    });

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      toStatus: 'pending',
      actorId: buyerId,
      actorRole: 'buyer',
    });

    const orderSummary = formatOrderSummary('ship_proxy', [], null, {
      trackingCode: data.trackingCode,
      pickupLocation: data.pickupLocation,
    });

    await notifyUser(tx, seller.userId, 'new_order', 'Đơn nhận đồ ship hộ mới', orderSummary, {
      orderId: order.id,
    });

    await refreshOrderCounters(tx, { sellerId: order.sellerId, buyerId });

    await tx.insert(checkoutIdempotencyKeys).values({
      userId: buyerId,
      key: idempotencyKey,
      orderId: order.id,
    });

    return { ...order, summary: orderSummary };
  }).catch(async (err) => {
    if (!isPgUniqueViolation(err)) throw err;
    const existing = await resolveIdempotentOrder(db, buyerId, idempotencyKey);
    if (existing) return existing;
    throw err;
  });
}

/**
 * Đổi trạng thái đơn: cập nhật orders, ghi lịch sử, cộng dồn thống kê, làm mới
 * counter và bắn thông báo.
 *
 * Toàn bộ phải cùng commit hoặc cùng rollback — nếu không, một lỗi giữa chừng có
 * thể để lại đơn `completed` mà doanh thu chưa được ghi nhận. Caller nào đã mở
 * transaction thì lời gọi này thành savepoint lồng bên trong.
 */
export async function transitionOrder(
  db: DbConn,
  orderId: string,
  toStatus: string,
  actorId: string,
  actorRole: string,
  note?: string,
) {
  return db.transaction((tx) =>
    runOrderTransition(tx, orderId, toStatus, actorId, actorRole, note),
  );
}

async function runOrderTransition(
  db: DbConn,
  orderId: string,
  toStatus: string,
  actorId: string,
  actorRole: string,
  note?: string,
) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new AppError(404, 'Không tìm thấy đơn', 'NOT_FOUND');

  const from = order.status;
  const orderType = order.type as 'food' | 'laundry' | 'ship_proxy';
  const validTransition =
    orderType === 'laundry'
      ? canTransitionLaundry(from as never, toStatus as never)
      : orderType === 'ship_proxy'
        ? canTransitionShipProxy(from as never, toStatus as never)
        : canTransitionFood(from as never, toStatus as never);

  if (!validTransition) {
    throw new AppError(409, `Không thể chuyển từ ${from} sang ${toStatus}`, 'INVALID_TRANSITION');
  }
  if (!canActorTransition(orderType, from, toStatus, actorRole)) {
    throw new AppError(403, `Bạn không được phép chuyển đơn sang ${toStatus}`, 'FORBIDDEN_TRANSITION');
  }

  // Chờ xác nhận giá chỉ hợp lệ sau khi seller đã ghi finalPrice qua /laundry-quote
  if (orderType === 'laundry' && toStatus === 'waiting_price_confirmation') {
    const [detail] = await db
      .select({ finalPrice: laundryOrderDetails.finalPrice })
      .from(laundryOrderDetails)
      .where(eq(laundryOrderDetails.orderId, orderId))
      .limit(1);
    if (!detail?.finalPrice || Number(detail.finalPrice) <= 0) {
      throw new AppError(409, 'Phải báo giá trước khi chờ xác nhận', 'QUOTE_REQUIRED');
    }
  }

  if (orderType === 'laundry' && toStatus === 'washing') {
    const [detail] = await db
      .select({ finalPrice: laundryOrderDetails.finalPrice })
      .from(laundryOrderDetails)
      .where(eq(laundryOrderDetails.orderId, orderId))
      .limit(1);
    if (!detail?.finalPrice || Number(detail.finalPrice) <= 0) {
      throw new AppError(409, 'Chưa có báo giá hợp lệ', 'QUOTE_REQUIRED');
    }
    if (actorRole === 'seller') {
      const [detailFlag] = await db
        .select({ autoConfirmQuote: laundryOrderDetails.autoConfirmQuote })
        .from(laundryOrderDetails)
        .where(eq(laundryOrderDetails.orderId, orderId))
        .limit(1);
      if (!detailFlag?.autoConfirmQuote) {
        throw new AppError(
          403,
          'Chỉ khách xác nhận báo giá — trừ khi khách đã chọn tự xác nhận khi đặt đơn',
          'BUYER_CONFIRM_REQUIRED',
        );
      }
    }
  }

  // Ship hộ: sau khi nhận đơn phải có CK đã duyệt mới được đi lấy
  if (
    orderType === 'ship_proxy' &&
    actorRole === 'seller' &&
    (toStatus === 'preparing' || toStatus === 'delivering')
  ) {
    const paid = order.paymentStatus === 'verified' || order.paymentStatus === 'paid';
    if (!paid) {
      throw new AppError(
        409,
        'Khách chưa chuyển khoản / biên lai chưa duyệt — không thể đi lấy hàng',
        'PAYMENT_REQUIRED',
      );
    }
  }

  // Chuyển khoản: không cho hoàn thành khi chưa xác nhận thanh toán
  if (toStatus === 'completed' && order.paymentMethod === 'bank_transfer') {
    const paid = order.paymentStatus === 'verified' || order.paymentStatus === 'paid';
    if (!paid) {
      throw new AppError(
        409,
        'Chưa xác nhận thanh toán chuyển khoản — không thể hoàn thành đơn',
        'PAYMENT_REQUIRED',
      );
    }
  }

  const [updated] = await db
    .update(orders)
    .set({
      status: toStatus,
      version: order.version + 1,
      updatedAt: new Date(),
      completedAt: toStatus === 'completed' ? new Date() : order.completedAt,
      cancelReason: toStatus === 'cancelled' ? note : order.cancelReason,
      cancelledBy: toStatus === 'cancelled' ? actorId : order.cancelledBy,
    })
    .where(and(eq(orders.id, orderId), eq(orders.version, order.version)))
    .returning();

  if (!updated) throw new AppError(409, 'Đơn đã được cập nhật bởi người khác', 'VERSION_CONFLICT');

  await db.insert(orderStatusHistory).values({
    orderId,
    fromStatus: from,
    toStatus,
    actorId,
    actorRole,
    note,
  });

  // Cộng dồn đúng một lần: `from !== 'completed'` + optimistic lock ở trên đảm bảo
  // không có hai transition song song nào cùng ghi nhận một đơn.
  if (toStatus === 'completed' && from !== 'completed') {
    await recordOrderCompleted(db, {
      orderId,
      sellerId: order.sellerId,
      buyerId: order.buyerId,
      total: updated.total,
      completedAt: updated.completedAt ?? new Date(),
    });
  }

  await refreshOrderCounters(db, { sellerId: order.sellerId, buyerId: order.buyerId });

  const [seller] = await db
    .select({ shopName: sellers.shopName })
    .from(sellers)
    .where(eq(sellers.id, order.sellerId))
    .limit(1);
  const shopName = seller?.shopName?.trim() || 'Cửa hàng';
  const statusLabel = orderStatusLabel(toStatus, orderType);

  await notifyUser(
    db,
    order.buyerId,
    'order_status',
    'Cập nhật đơn hàng',
    `${shopName}: ${statusLabel}`,
    { orderId, shopName, status: toStatus },
  );

  return updated;
}

/** Nhóm trạng thái cho tab list buyer/seller — khớp FE. */
export const ORDER_LIST_SCOPES = {
  buyer_active: [
    'pending',
    'accepted',
    'preparing',
    'delivering',
    'picking_up',
    'picked_up',
    'waiting_price_confirmation',
    'washing',
    'returning',
  ],
  buyer_done: ['completed'],
  seller_active: [
    'pending',
    'accepted',
    'preparing',
    'picking_up',
    'picked_up',
    'waiting_price_confirmation',
    'washing',
  ],
  seller_delivering: ['delivering', 'returning'],
  seller_done: ['completed'],
} as const;

export type OrderListScope =
  | 'active'
  | 'delivering'
  | 'done'
  | 'all';

function scopeStatuses(role: string, scope: OrderListScope): string[] | null {
  if (scope === 'all') return null;
  if (role === 'buyer') {
    if (scope === 'active') return [...ORDER_LIST_SCOPES.buyer_active];
    if (scope === 'done') return [...ORDER_LIST_SCOPES.buyer_done];
    return null;
  }
  if (role === 'seller') {
    if (scope === 'active') return [...ORDER_LIST_SCOPES.seller_active];
    if (scope === 'delivering') return [...ORDER_LIST_SCOPES.seller_delivering];
    if (scope === 'done') return [...ORDER_LIST_SCOPES.seller_done];
  }
  return null;
}

/** Cột list card — chọn tường minh thay vì SELECT * (bỏ cancel/stats nội bộ). */
const ORDER_LIST_COLUMNS = {
  id: orders.id,
  orderCode: orders.orderCode,
  type: orders.type,
  buyerId: orders.buyerId,
  sellerId: orders.sellerId,
  status: orders.status,
  paymentMethod: orders.paymentMethod,
  paymentStatus: orders.paymentStatus,
  subtotal: orders.subtotal,
  total: orders.total,
  notes: orders.notes,
  recipientName: orders.recipientName,
  recipientPhone: orders.recipientPhone,
  deliveryAddress: orders.deliveryAddress,
  pickupAddress: orders.pickupAddress,
  returnAddress: orders.returnAddress,
  desiredDeliveryAt: orders.desiredDeliveryAt,
  desiredDeliveryUntil: orders.desiredDeliveryUntil,
  lateDeliveryWarnedAt: orders.lateDeliveryWarnedAt,
  pickupScheduledAt: orders.pickupScheduledAt,
  version: orders.version,
  createdAt: orders.createdAt,
  updatedAt: orders.updatedAt,
  completedAt: orders.completedAt,
} as const;

export type OrderListRow = {
  id: string;
  orderCode: string;
  type: string;
  buyerId: string;
  sellerId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: string;
  total: string;
  notes: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  deliveryAddress: unknown;
  pickupAddress: unknown;
  returnAddress: unknown;
  desiredDeliveryAt: Date | null;
  desiredDeliveryUntil: Date | null;
  lateDeliveryWarnedAt: Date | null;
  pickupScheduledAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export async function getOrdersForUser(
  db: Database,
  userId: string,
  role: string,
  page = 1,
  limit = 20,
  scope: OrderListScope = 'all',
): Promise<OrderListRow[]> {
  const offset = (page - 1) * limit;
  const statuses = scopeStatuses(role, scope);

  if (role === 'buyer') {
    const where = statuses
      ? and(eq(orders.buyerId, userId), inArray(orders.status, statuses))
      : eq(orders.buyerId, userId);
    return db
      .select(ORDER_LIST_COLUMNS)
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);
  }
  if (role === 'seller') {
    const [seller] = await db.select().from(sellers).where(eq(sellers.userId, userId)).limit(1);
    if (!seller) return [];
    const where = statuses
      ? and(eq(orders.sellerId, seller.id), inArray(orders.status, statuses))
      : eq(orders.sellerId, seller.id);
    return db
      .select(ORDER_LIST_COLUMNS)
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);
  }
  // Admin dùng /api/admin/orders — không liệt kê toàn hệ thống tại đây.
  return [];
}

/** Đếm theo tab — badge ưu tiên đọc counter; done vẫn COUNT trên đơn còn lại (≤7 ngày). */
export async function countOrdersByScope(db: Database, userId: string, role: string) {
  if (role === 'buyer') {
    const [[counter], [doneRow]] = await Promise.all([
      db.select().from(buyerCounters).where(eq(buyerCounters.userId, userId)).limit(1),
      db
        .select({
          done: sql<number>`coalesce(count(*) filter (where ${orders.status} = 'completed'), 0)::int`,
        })
        .from(orders)
        .where(eq(orders.buyerId, userId)),
    ]);
    return {
      active: counter?.openCount ?? 0,
      delivering: 0,
      done: Number(doneRow?.done ?? 0),
      pending: counter?.pendingCount ?? 0,
      preparing: 0,
      completedRevenue: 0,
      monthlyRevenue: 0,
      monthlyOrderCount: 0,
      billingPeriodStartedAt: null as string | null,
    };
  }

  if (role === 'seller') {
    const [seller] = await db.select().from(sellers).where(eq(sellers.userId, userId)).limit(1);
    if (!seller) {
      return {
        active: 0,
        delivering: 0,
        done: 0,
        pending: 0,
        preparing: 0,
        completedRevenue: 0,
        monthlyRevenue: 0,
        monthlyOrderCount: 0,
        billingPeriodStartedAt: null as string | null,
      };
    }
    const periodStart = await getBillingPeriodStartedAt(db);
    const periodStartIso = periodStart.toISOString();
    const [[counter], [doneRow], [periodRow]] = await Promise.all([
      db.select().from(sellerCounters).where(eq(sellerCounters.sellerId, seller.id)).limit(1),
      db
        .select({
          done: sql<number>`coalesce(count(*) filter (where ${orders.status} = 'completed'), 0)::int`,
        })
        .from(orders)
        .where(eq(orders.sellerId, seller.id)),
      db
        .select({
          revenue: sql<number>`coalesce(sum(${sellerDailyStats.revenue}), 0)::float8`,
          orderCount: sql<number>`coalesce(sum(${sellerDailyStats.completedOrders}), 0)::int`,
        })
        .from(sellerDailyStats)
        .where(
          and(
            eq(sellerDailyStats.sellerId, seller.id),
            sql`${sellerDailyStats.day} >= (${periodStartIso}::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date`,
          ),
        ),
    ]);
    const pending = counter?.pendingCount ?? 0;
    const delivering = counter?.deliveringCount ?? 0;
    const open = counter?.openCount ?? 0;
    const active = Math.max(0, open - delivering);
    const preparing = Math.max(0, active - pending);
    const monthlyRevenue = Number(periodRow?.revenue ?? 0);
    const monthlyOrderCount = Number(periodRow?.orderCount ?? 0);
    return {
      active,
      delivering,
      done: Number(doneRow?.done ?? 0),
      pending,
      preparing,
      completedRevenue: monthlyRevenue,
      monthlyRevenue,
      monthlyOrderCount,
      billingPeriodStartedAt: periodStartIso,
    };
  }

  return {
    active: 0,
    delivering: 0,
    done: 0,
    pending: 0,
    preparing: 0,
    completedRevenue: 0,
    monthlyRevenue: 0,
    monthlyOrderCount: 0,
    billingPeriodStartedAt: null as string | null,
  };
}

export async function enrichOrdersList(
  db: DbConn,
  orderRows: OrderListRow[] | (typeof orders.$inferSelect)[],
  options?: { includeBuyer?: boolean; includeDetails?: boolean },
) {
  if (orderRows.length === 0) return [];

  const foodOrderIds = orderRows.filter((o) => o.type === 'food').map((o) => o.id);
  const laundryOrderIds = orderRows.filter((o) => o.type === 'laundry').map((o) => o.id);
  const shipOrderIds = orderRows.filter((o) => o.type === 'ship_proxy').map((o) => o.id);

  const itemsRows = foodOrderIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, foodOrderIds))
    : [];
  const laundryRows = laundryOrderIds.length
    ? await db.select().from(laundryOrderDetails).where(inArray(laundryOrderDetails.orderId, laundryOrderIds))
    : [];
  const shipRows = shipOrderIds.length
    ? await db.select().from(shipProxyOrderDetails).where(inArray(shipProxyOrderDetails.orderId, shipOrderIds))
    : [];

  const itemsByOrder = new Map<string, typeof itemsRows>();
  for (const item of itemsRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }
  const laundryByOrder = new Map(laundryRows.map((l) => [l.orderId, l]));
  const shipByOrder = new Map(shipRows.map((s) => [s.orderId, s]));

  let buyerMap = new Map<string, string>();
  if (options?.includeBuyer) {
    const buyerIds = [...new Set(orderRows.map((o) => o.buyerId))];
    const buyers = await db
      .select({ id: profiles.id, fullName: profiles.fullName })
      .from(profiles)
      .where(inArray(profiles.id, buyerIds));
    buyerMap = new Map(buyers.map((b) => [b.id, b.fullName]));
  }

  // Chỉ lấy biên lai khi seller xem list (includeBuyer) — tránh nặng buyer list
  const proofByOrder = new Map<string, { id: string; imageUrl: string; status: string }[]>();
  if (options?.includeBuyer && options?.includeDetails) {
    const idsNeedingProof = orderRows
      .filter(
        (o) =>
          o.paymentMethod === 'bank_transfer'
          && ['proof_uploaded', 'verified', 'rejected', 'paid'].includes(o.paymentStatus),
      )
      .map((o) => o.id);
    if (idsNeedingProof.length > 0) {
      const proofRows = await db
        .select({
          id: paymentProofs.id,
          orderId: paymentProofs.orderId,
          imageUrl: paymentProofs.imageUrl,
          status: paymentProofs.status,
        })
        .from(paymentProofs)
        .where(inArray(paymentProofs.orderId, idsNeedingProof));
      for (const p of proofRows) {
        const list = proofByOrder.get(p.orderId) ?? [];
        list.push({ id: p.id, imageUrl: p.imageUrl, status: p.status });
        proofByOrder.set(p.orderId, list);
      }
    }
  }

  const complaintByOrder = new Map<
    string,
    { id: string; reason: string; status: string; createdAt: Date }
  >();
  {
    const orderIds = orderRows.map((o) => o.id);
    if (orderIds.length) {
      const complaintRows = await db
        .select({
          id: complaints.id,
          orderId: complaints.orderId,
          reason: complaints.reason,
          status: complaints.status,
          createdAt: complaints.createdAt,
        })
        .from(complaints)
        .where(inArray(complaints.orderId, orderIds));
      for (const c of complaintRows) {
        if (!c.orderId) continue;
        complaintByOrder.set(c.orderId, {
          id: c.id,
          reason: c.reason,
          status: c.status,
          createdAt: c.createdAt,
        });
      }
    }
  }

  return orderRows.map((order) => {
    const items = itemsByOrder.get(order.id) ?? [];
    const laundry = laundryByOrder.get(order.id);
    const ship = shipByOrder.get(order.id);
    const enriched: Record<string, unknown> = {
      ...order,
      summary: formatOrderSummary(order.type, items, laundry, ship),
    };
    if (options?.includeBuyer) {
      enriched.buyerName = buyerMap.get(order.buyerId) ?? 'Khách';
    }
    const complaint = complaintByOrder.get(order.id);
    if (complaint) enriched.complaint = complaint;
    // items / laundry / shipProxy luôn trả — màn list quán cần topping, ghi chú, block giặt/ship.
    // includeDetails chỉ gắn proofs (và caller mới ký signed URL).
    if (order.type === 'food') {
      enriched.items = items.map((i) => ({
        itemName: i.itemName,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
        note: i.note ?? null,
        options: Array.isArray(i.optionsSnapshot) ? i.optionsSnapshot : [],
      }));
    }
    if (order.type === 'laundry') {
      enriched.laundry = laundry ?? null;
    }
    if (order.type === 'ship_proxy') {
      enriched.shipProxy = ship ?? null;
    }
    if (options?.includeDetails) {
      const proofs = proofByOrder.get(order.id);
      if (proofs?.length) enriched.proofs = proofs;
    }
    return enriched;
  });
}

export async function getSellerRating(db: Database, sellerId: string) {
  const map = await getSellerRatingsMap(db, [sellerId]);
  return map.get(sellerId) ?? { average: 0, count: 0 };
}

/**
 * Batch rating cho danh sách seller — đọc tổng đã cộng dồn trên sellers,
 * không AVG lại bảng reviews (và không phụ thuộc việc reviews có bị dọn hay không).
 */
export async function getSellerRatingsMap(db: Database, sellerIds: string[]) {
  if (sellerIds.length === 0) return new Map<string, { average: number; count: number }>();

  const rows = await db
    .select({
      sellerId: sellers.id,
      sum: sellers.ratingSum,
      count: sellers.ratingCount,
    })
    .from(sellers)
    .where(inArray(sellers.id, sellerIds));

  const map = new Map<string, { average: number; count: number }>();
  for (const id of sellerIds) map.set(id, { average: 0, count: 0 });
  for (const row of rows) {
    const count = Number(row.count ?? 0);
    map.set(row.sellerId, {
      average: count > 0 ? Number(row.sum ?? 0) / count : 0,
      count,
    });
  }
  return map;
}

export async function getActiveBanners(db: Database, opts?: { popupOnly?: boolean }) {
  const now = new Date();
  const conditions = [
    eq(banners.isActive, true),
    or(isNull(banners.startsAt), lte(banners.startsAt, now)),
    or(isNull(banners.endsAt), gte(banners.endsAt, now)),
  ];
  if (opts?.popupOnly === true) conditions.push(eq(banners.isPopup, true));
  if (opts?.popupOnly === false) conditions.push(eq(banners.isPopup, false));

  return db
    .select()
    .from(banners)
    .where(and(...conditions))
    .orderBy(banners.sortOrder);
}

export type FeedPost = {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  ctaLabel: string | null;
  linkUrl: string | null;
  foodItemId: string | null;
  isPinned: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  sellerId: string | null;
  shopName: string | null;
  avatarUrl: string | null;
  serviceTypes: 'food' | 'laundry' | 'ship_proxy' | null;
};

function normalizePostImages(imageUrl: string | null, imageUrls: unknown): string[] {
  const fromArr = Array.isArray(imageUrls)
    ? imageUrls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    : [];
  const out = [...fromArr];
  if (imageUrl?.trim() && !out.includes(imageUrl.trim())) out.unshift(imageUrl.trim());
  return out.slice(0, 10);
}

/** Ảnh đại diện bài platform (không gắn quán) — lấy từ hồ sơ admin đã upload. */
async function getPlatformAvatarUrl(db: Database): Promise<string | null> {
  const [admin] = await db
    .select({ avatarUrl: profiles.avatarUrl })
    .from(profiles)
    .where(and(eq(profiles.role, 'admin'), isNotNull(profiles.avatarUrl)))
    .orderBy(desc(profiles.updatedAt))
    .limit(1);
  return admin?.avatarUrl?.trim() || null;
}

export async function getPublishedPosts(db: Database, limit = 30): Promise<FeedPost[]> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      body: posts.body,
      imageUrl: posts.imageUrl,
      imageUrls: posts.imageUrls,
      ctaLabel: posts.ctaLabel,
      linkUrl: posts.linkUrl,
      foodItemId: posts.foodItemId,
      isPinned: posts.isPinned,
      publishedAt: posts.publishedAt,
      createdAt: posts.createdAt,
      sellerId: posts.sellerId,
      shopName: sellers.shopName,
      avatarUrl: sellers.avatarUrl,
      serviceTypes: sellers.serviceTypes,
    })
    .from(posts)
    .leftJoin(sellers, eq(posts.sellerId, sellers.id))
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.isPinned), desc(posts.publishedAt), desc(posts.createdAt))
    .limit(limit);

  const needsPlatformAvatar = rows.some((r) => !r.sellerId && !r.avatarUrl);
  const platformAvatar = needsPlatformAvatar ? await getPlatformAvatarUrl(db) : null;

  return rows.map((r) => ({
    ...r,
    imageUrls: normalizePostImages(r.imageUrl, r.imageUrls),
    shopName: r.shopName ?? (r.sellerId ? null : 'Làng Đại Học'),
    avatarUrl: r.avatarUrl ?? (r.sellerId ? null : platformAvatar),
    serviceTypes: r.serviceTypes ?? null,
  }));
}

export async function getPublishedPostById(db: Database, id: string): Promise<FeedPost | null> {
  const [row] = await db
    .select({
      id: posts.id,
      title: posts.title,
      body: posts.body,
      imageUrl: posts.imageUrl,
      imageUrls: posts.imageUrls,
      ctaLabel: posts.ctaLabel,
      linkUrl: posts.linkUrl,
      foodItemId: posts.foodItemId,
      isPinned: posts.isPinned,
      publishedAt: posts.publishedAt,
      createdAt: posts.createdAt,
      sellerId: posts.sellerId,
      shopName: sellers.shopName,
      avatarUrl: sellers.avatarUrl,
      serviceTypes: sellers.serviceTypes,
    })
    .from(posts)
    .leftJoin(sellers, eq(posts.sellerId, sellers.id))
    .where(and(eq(posts.id, id), eq(posts.status, 'published')))
    .limit(1);

  if (!row) return null;
  const platformAvatar =
    !row.sellerId && !row.avatarUrl ? await getPlatformAvatarUrl(db) : null;
  return {
    ...row,
    imageUrls: normalizePostImages(row.imageUrl, row.imageUrls),
    shopName: row.shopName ?? (row.sellerId ? null : 'Làng Đại Học'),
    avatarUrl: row.avatarUrl ?? (row.sellerId ? null : platformAvatar),
    serviceTypes: row.serviceTypes ?? null,
  };
}

export async function getSellerReviews(db: Database, sellerId: string, limit = 10) {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      tags: reviews.tags,
      createdAt: reviews.createdAt,
      buyerName: profiles.fullName,
    })
    .from(reviews)
    .innerJoin(profiles, eq(reviews.buyerId, profiles.id))
    .where(eq(reviews.sellerId, sellerId))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}
