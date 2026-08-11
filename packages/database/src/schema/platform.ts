import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Key-value cấu hình hệ thống (vd. mốc bắt đầu “tháng” doanh thu đối tác). */
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const BILLING_PERIOD_STARTED_AT_KEY = 'billing_period_started_at';
