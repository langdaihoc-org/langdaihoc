import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Mốc chạy gần nhất của job nền — chặn chạy trùng khi process khởi động lại. */
export const jobRuns = pgTable('job_runs', {
  job: text('job').primaryKey(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }).notNull().defaultNow(),
});
