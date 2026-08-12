import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  pgEnum,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['buyer', 'seller', 'admin']);
export const userStatusEnum = pgEnum('user_status', [
  'pending_email_verification',
  'active',
  'suspended',
  'deleted',
]);
export const sellerStatusEnum = pgEnum('seller_status', [
  'pending',
  'approved',
  'rejected',
  'suspended',
]);
export const serviceTypeEnum = pgEnum('service_type', ['food', 'laundry', 'ship_proxy']);
export const addressTypeEnum = pgEnum('address_type', ['dorm', 'rental', 'other']);

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    /** Primary / default role — active role is stored in session cookie. */
    role: userRoleEnum('role').notNull(),
    status: userStatusEnum('status').notNull().default('pending_email_verification'),
    fullName: varchar('full_name', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    avatarUrl: text('avatar_url'),
    suspendedReason: text('suspended_reason'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('profiles_role_status_idx').on(table.role, table.status)],
);

/** Multi-role membership — source of truth for roles (§3.1 đặc tả). */
export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('user_roles_user_role_idx').on(table.userId, table.role)],
);

export const sellers = pgTable(
  'sellers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' })
      .unique(),
    shopName: varchar('shop_name', { length: 120 }).notNull(),
    serviceTypes: serviceTypeEnum('service_types').notNull(),
    businessAddress: text('business_address').notNull(),
    description: text('description'),
    avatarUrl: text('avatar_url'),
    /** SĐT liên hệ quán (hiện cho người mua) */
    phone: varchar('phone', { length: 20 }),
    /** Giờ hoạt động — seller tự điền (vd: T2–CN 8:00–21:00) */
    openHours: text('open_hours'),
    /** Khu vực giao / phục vụ — seller tự điền (vd: KTX A, Bcons) */
    serviceAreas: text('service_areas').array(),
    /** Thời gian giao TB từ nhận đơn đến giao thành công (phút) — seller set */
    avgDeliveryMinutes: integer('avg_delivery_minutes'),
    /** Phí nhận hộ (VND) — chỉ dùng khi serviceTypes = ship_proxy */
    shipProxyFee: numeric('ship_proxy_fee', { precision: 12, scale: 0 }).notNull().default('15000'),
    acceptingOrders: boolean('accepting_orders').notNull().default(true),
    /** Rating tổng hợp — giữ độc lập với bảng reviews để không phải AVG khi đọc catalog. */
    ratingSum: integer('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    status: sellerStatusEnum('status').notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sellers_status_idx').on(table.status),
    index('sellers_status_service_idx').on(table.status, table.serviceTypes),
  ],
);

export const buyerAddresses = pgTable(
  'buyer_addresses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    recipientName: varchar('recipient_name', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    detail: text('detail').notNull(),
    dormName: varchar('dorm_name', { length: 120 }),
    roomNumber: varchar('room_number', { length: 30 }),
    note: text('note'),
    addressType: addressTypeEnum('address_type').notNull().default('dorm'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('buyer_addresses_user_idx').on(table.userId)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id').references(() => profiles.id),
    actorRole: userRoleEnum('actor_role'),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id'),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    ip: varchar('ip', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_actor_idx').on(table.actorId),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    index('audit_logs_created_idx').on(table.createdAt),
  ],
);

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  seller: one(sellers, {
    fields: [profiles.id],
    references: [sellers.userId],
  }),
  addresses: many(buyerAddresses),
  roles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(profiles, {
    fields: [userRoles.userId],
    references: [profiles.id],
  }),
}));

export const sellersRelations = relations(sellers, ({ one }) => ({
  user: one(profiles, {
    fields: [sellers.userId],
    references: [profiles.id],
  }),
}));
