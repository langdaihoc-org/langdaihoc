import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { profiles } from './auth.js';
import { orders } from './commerce.js';

export const checkoutIdempotencyKeys = pgTable(
  'checkout_idempotency_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 64 }).notNull(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('checkout_idempotency_user_key_idx').on(t.userId, t.key),
    index('checkout_idempotency_created_idx').on(t.createdAt),
  ],
);
