import { pgTable, text, timestamp, uuid, varchar, index } from 'drizzle-orm/pg-core';
import { profiles } from './auth.js';

/** Key-value cấu hình hệ thống (vd. mốc bắt đầu “tháng” doanh thu đối tác). */
export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const BILLING_PERIOD_STARTED_AT_KEY = 'billing_period_started_at';

/** Góp ý / báo lỗi từ chân trang — gửi tới admin. */
export const siteFeedback = pgTable(
  'site_feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: varchar('type', { length: 20 }).notNull(), // feedback | bug
    message: text('message').notNull(),
    contact: varchar('contact', { length: 200 }),
    pageUrl: text('page_url'),
    userId: uuid('user_id').references(() => profiles.id),
    status: varchar('status', { length: 20 }).notNull().default('new'), // new | read | done
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('site_feedback_status_idx').on(t.status),
    index('site_feedback_created_idx').on(t.createdAt),
  ],
);