import { pgTable, uuid, integer, numeric, timestamp, date, bigint, index, primaryKey } from 'drizzle-orm/pg-core';
import { profiles, sellers } from './auth.js';

/**
 * Doanh thu/đơn hoàn thành theo ngày — cộng dồn ngay khi đơn completed.
 * Nguồn sự thật cho báo cáo tháng/quý vì orders đã đóng bị xóa sau 7 ngày.
 */
export const sellerDailyStats = pgTable(
  'seller_daily_stats',
  {
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    /** Ngày theo giờ VN (UTC+7). */
    day: date('day').notNull(),
    completedOrders: integer('completed_orders').notNull().default(0),
    revenue: numeric('revenue', { precision: 14, scale: 0 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'seller_daily_stats_pk', columns: [t.sellerId, t.day] }),
    index('seller_daily_stats_day_idx').on(t.day),
  ],
);

/** Bộ đếm trực tiếp cho pulse seller — đọc theo khóa chính, không COUNT trên orders. */
export const sellerCounters = pgTable('seller_counters', {
  sellerId: uuid('seller_id')
    .primaryKey()
    .references(() => sellers.id, { onDelete: 'cascade' }),
  pendingCount: integer('pending_count').notNull().default(0),
  openCount: integer('open_count').notNull().default(0),
  deliveringCount: integer('delivering_count').notNull().default(0),
  lateWarningCount: integer('late_warning_count').notNull().default(0),
  openComplaintCount: integer('open_complaint_count').notNull().default(0),
  lifetimeOrders: integer('lifetime_orders').notNull().default(0),
  lifetimeRevenue: numeric('lifetime_revenue', { precision: 16, scale: 0 }).notNull().default('0'),
  unreadCount: integer('unread_count').notNull().default(0),
  latestNotificationAt: timestamp('latest_notification_at', { withTimezone: true }),
  latestOrderAt: timestamp('latest_order_at', { withTimezone: true }),
  latestChangeAt: timestamp('latest_change_at', { withTimezone: true }).notNull().defaultNow(),
  version: bigint('version', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Bộ đếm trực tiếp cho pulse buyer. */
export const buyerCounters = pgTable('buyer_counters', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  pendingCount: integer('pending_count').notNull().default(0),
  openCount: integer('open_count').notNull().default(0),
  lifetimeCompleted: integer('lifetime_completed').notNull().default(0),
  unreadCount: integer('unread_count').notNull().default(0),
  latestNotificationAt: timestamp('latest_notification_at', { withTimezone: true }),
  latestOrderAt: timestamp('latest_order_at', { withTimezone: true }),
  latestChangeAt: timestamp('latest_change_at', { withTimezone: true }).notNull().defaultNow(),
  version: bigint('version', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
