import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  pgEnum,
  integer,
  jsonb,
  numeric,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { profiles, sellers } from './auth.js';

export const categoryTypeEnum = pgEnum('category_type', ['food', 'laundry']);
export const orderTypeEnum = pgEnum('order_type', ['food', 'laundry', 'ship_proxy']);
export const foodOrderStatusEnum = pgEnum('food_order_status', [
  'pending',
  'accepted',
  'preparing',
  'delivering',
  'completed',
  'cancelled',
  'rejected',
]);
export const laundryOrderStatusEnum = pgEnum('laundry_order_status', [
  'pending',
  'accepted',
  'picking_up',
  'picked_up',
  'waiting_price_confirmation',
  'washing',
  'returning',
  'completed',
  'cancelled',
  'needs_support',
]);
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'bank_transfer']);
export const paymentStatusEnum = pgEnum('payment_status', [
  'unpaid',
  'pending',
  'proof_uploaded',
  'verified',
  'rejected',
  'paid',
]);
export const laundryUnitEnum = pgEnum('laundry_unit', ['kg', 'item', 'load']);
export const complaintStatusEnum = pgEnum('complaint_status', [
  'new',
  'processing',
  'waiting_seller',
  'resolved',
  'rejected',
]);
export const proofStatusEnum = pgEnum('proof_status', [
  'pending',
  'proof_uploaded',
  'verified',
  'rejected',
]);

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  type: categoryTypeEnum('type').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sellerBankAccounts = pgTable(
  'seller_bank_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    bankName: varchar('bank_name', { length: 100 }).notNull(),
    accountNumber: varchar('account_number', { length: 30 }).notNull(),
    accountHolder: varchar('account_holder', { length: 100 }).notNull(),
    qrImageUrl: text('qr_image_url'),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('seller_bank_accounts_seller_idx').on(t.sellerId)],
);

export const foodItems = pgTable(
  'food_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id),
    /** Nhiều danh mục cho 1 món (ưu tiên hơn categoryId đơn) */
    categoryIds: jsonb('category_ids').$type<string[]>().default([]),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description'),
    price: numeric('price', { precision: 12, scale: 0 }).notNull(),
    prepTimeMinutes: integer('prep_time_minutes').notNull().default(20),
    imageUrl: text('image_url'),
    /** Nhiều ảnh món (ưu tiên hơn imageUrl) */
    imageUrls: jsonb('image_urls').$type<string[]>().default([]),
    isAvailable: boolean('is_available').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('food_items_seller_idx').on(t.sellerId),
    index('food_items_category_idx').on(t.categoryId),
    index('food_items_seller_available_sort_idx').on(t.sellerId, t.sortOrder),
  ],
);

export const foodOptionGroups = pgTable(
  'food_option_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    foodItemId: uuid('food_item_id')
      .notNull()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    required: boolean('required').notNull().default(false),
    minSelect: integer('min_select').notNull().default(0),
    maxSelect: integer('max_select').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('food_option_groups_item_idx').on(t.foodItemId)],
);

export const foodItemOptions = pgTable(
  'food_item_options',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    foodItemId: uuid('food_item_id')
      .notNull()
      .references(() => foodItems.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => foodOptionGroups.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    priceDelta: numeric('price_delta', { precision: 12, scale: 0 }).notNull().default('0'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('food_item_options_item_idx').on(t.foodItemId), index('food_item_options_group_idx').on(t.groupId)],
);

export const laundryServices = pgTable(
  'laundry_services',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 150 }).notNull(),
    description: text('description'),
    unit: laundryUnitEnum('unit').notNull().default('kg'),
    basePrice: numeric('base_price', { precision: 12, scale: 0 }).notNull(),
    estimatedTimeHours: integer('estimated_time_hours').notNull().default(24),
    serviceAreas: text('service_areas').array(),
    imageUrl: text('image_url'),
    isAvailable: boolean('is_available').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('laundry_services_seller_idx').on(t.sellerId), index('laundry_services_seller_available_idx').on(t.sellerId)],
);

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' })
      .unique(),
    sellerId: uuid('seller_id').references(() => sellers.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('carts_user_idx').on(t.userId), index('carts_seller_idx').on(t.sellerId)],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    foodItemId: uuid('food_item_id')
      .notNull()
      .references(() => foodItems.id),
    quantity: integer('quantity').notNull().default(1),
    note: text('note'),
    optionsJson: jsonb('options_json').$type<{ id: string; name: string; priceDelta: number }[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cart_items_cart_idx').on(t.cartId), index('cart_items_food_item_idx').on(t.foodItemId)],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderCode: varchar('order_code', { length: 30 }).notNull().unique(),
    type: orderTypeEnum('type').notNull(),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => profiles.id),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id),
    status: varchar('status', { length: 40 }).notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('unpaid'),
    subtotal: numeric('subtotal', { precision: 12, scale: 0 }).notNull(),
    total: numeric('total', { precision: 12, scale: 0 }).notNull(),
    notes: text('notes'),
    recipientName: varchar('recipient_name', { length: 100 }),
    recipientPhone: varchar('recipient_phone', { length: 20 }),
    deliveryAddress: jsonb('delivery_address'),
    desiredDeliveryAt: timestamp('desired_delivery_at', { withTimezone: true }),
    pickupAddress: jsonb('pickup_address'),
    returnAddress: jsonb('return_address'),
    pickupScheduledAt: timestamp('pickup_scheduled_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    cancelledBy: uuid('cancelled_by').references(() => profiles.id),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('orders_buyer_idx').on(t.buyerId, t.createdAt),
    index('orders_seller_idx').on(t.sellerId, t.status),
    index('orders_seller_created_idx').on(t.sellerId, t.createdAt),
    index('orders_status_created_idx').on(t.status, t.createdAt),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    foodItemId: uuid('food_item_id'),
    itemName: varchar('item_name', { length: 150 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 0 }).notNull(),
    quantity: integer('quantity').notNull(),
    optionsSnapshot: jsonb('options_snapshot'),
    note: text('note'),
    lineTotal: numeric('line_total', { precision: 12, scale: 0 }).notNull(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
);

export const laundryOrderDetails = pgTable('laundry_order_details', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' })
    .unique(),
  serviceId: uuid('service_id'),
  serviceName: varchar('service_name', { length: 150 }).notNull(),
  estimatedQty: numeric('estimated_qty', { precision: 10, scale: 2 }),
  estimatedUnit: laundryUnitEnum('estimated_unit'),
  actualQty: numeric('actual_qty', { precision: 10, scale: 2 }),
  actualWeightKg: numeric('actual_weight_kg', { precision: 10, scale: 2 }),
  unitPrice: numeric('unit_price', { precision: 12, scale: 0 }),
  surcharge: numeric('surcharge', { precision: 12, scale: 0 }).default('0'),
  finalPrice: numeric('final_price', { precision: 12, scale: 0 }),
  sellerNote: text('seller_note'),
  buyerPriceConfirmedAt: timestamp('buyer_price_confirmed_at', { withTimezone: true }),
  priceRejectedAt: timestamp('price_rejected_at', { withTimezone: true }),
});

/** Chi tiết đơn lấy hàng ship hộ */
export const shipProxyOrderDetails = pgTable('ship_proxy_order_details', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' })
    .unique(),
  /** Mã / số shipper gốc (Shopee, GHTK...) */
  trackingCode: varchar('tracking_code', { length: 120 }).notNull(),
  /** Vị trí lấy hàng */
  pickupLocation: text('pickup_location').notNull(),
  /** Thời gian lấy hàng */
  pickupAt: timestamp('pickup_at', { withTimezone: true }).notNull(),
  /** SĐT nhận đơn hàng (nhập đầy đủ) */
  receivePhone: varchar('receive_phone', { length: 20 }).notNull(),
  /** Thời gian muốn nhận lại hàng */
  returnAt: timestamp('return_at', { withTimezone: true }).notNull(),
  /** Địa chỉ nhận lại hàng */
  returnAddressText: text('return_address_text').notNull(),
  /** SĐT liên lạc với người ship hộ */
  contactPhone: varchar('contact_phone', { length: 20 }).notNull(),
  /** Giá tiền hàng cần nhận hộ (khách khai — không phải phí dịch vụ) */
  packageValue: numeric('package_value', { precision: 12, scale: 0 }).notNull().default('0'),
});

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: varchar('from_status', { length: 40 }),
    toStatus: varchar('to_status', { length: 40 }).notNull(),
    actorId: uuid('actor_id'),
    actorRole: varchar('actor_role', { length: 20 }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_status_history_order_idx').on(t.orderId)],
);

export const paymentProofs = pgTable(
  'payment_proofs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    imageUrl: text('image_url').notNull(),
    status: proofStatusEnum('status').notNull().default('proof_uploaded'),
    rejectionReason: text('rejection_reason'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by'),
  },
  (t) => [
    index('payment_proofs_order_idx').on(t.orderId),
    index('payment_proofs_order_uploaded_idx').on(t.orderId, t.uploadedAt),
  ],
);

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id)
      .unique(),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => profiles.id),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    tags: text('tags').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reviews_seller_idx').on(t.sellerId),
    index('reviews_seller_created_idx').on(t.sellerId, t.createdAt),
  ],
);

export const complaints = pgTable(
  'complaints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    buyerId: uuid('buyer_id')
      .notNull()
      .references(() => profiles.id),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id),
    reason: varchar('reason', { length: 200 }).notNull(),
    description: text('description').notNull(),
    evidenceUrls: text('evidence_urls').array(),
    status: complaintStatusEnum('status').notNull().default('new'),
    adminResolution: text('admin_resolution'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('complaints_seller_idx').on(t.sellerId),
    index('complaints_status_idx').on(t.status),
    index('complaints_order_idx').on(t.orderId),
    index('complaints_created_idx').on(t.createdAt),
  ],
);

export const complaintMessages = pgTable(
  'complaint_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    complaintId: uuid('complaint_id')
      .notNull()
      .references(() => complaints.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id),
    authorRole: varchar('author_role', { length: 20 }).notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('complaint_messages_complaint_idx').on(t.complaintId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    data: jsonb('data'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.readAt),
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    index('notifications_created_idx').on(t.createdAt),
  ],
);

export const banners = pgTable(
  'banners',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 200 }).notNull(),
    subtitle: text('subtitle'),
    imageUrl: text('image_url'),
    linkUrl: text('link_url'),
    ctaLabel: varchar('cta_label', { length: 80 }),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    /** Popup kiểu Shopee (1 lần/ngày); false = banner ngang trên home */
    isPopup: boolean('is_popup').notNull().default(false),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('banners_active_sort_idx').on(t.sortOrder)],
);

export const postStatusEnum = pgEnum('post_status', [
  'published',
  'hidden',
  'pending',
  'rejected',
]);

/** Feed kiểu Facebook — bài quán/admin, CTA dẫn đặt hàng */
export const posts = pgTable(
  'posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sellerId: uuid('seller_id').references(() => sellers.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    imageUrl: text('image_url'),
    /** Nhiều ảnh kiểu collage Facebook (ưu tiên hơn imageUrl) */
    imageUrls: jsonb('image_urls').$type<string[]>().default([]),
    ctaLabel: varchar('cta_label', { length: 80 }),
    linkUrl: text('link_url'),
    foodItemId: uuid('food_item_id').references(() => foodItems.id, { onDelete: 'set null' }),
    status: postStatusEnum('status').notNull().default('published'),
    isPinned: boolean('is_pinned').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('posts_status_published_idx').on(t.status, t.publishedAt),
    index('posts_seller_idx').on(t.sellerId),
    index('posts_food_item_idx').on(t.foodItemId),
    index('posts_feed_idx').on(t.status, t.isPinned, t.publishedAt),
  ],
);

export const sellersCommerceRelations = relations(sellers, ({ many }) => ({
  foodItems: many(foodItems),
  laundryServices: many(laundryServices),
  bankAccounts: many(sellerBankAccounts),
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  seller: one(sellers, { fields: [posts.sellerId], references: [sellers.id] }),
  foodItem: one(foodItems, { fields: [posts.foodItemId], references: [foodItems.id] }),
}));
