import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export function createDb(connectionString: string) {
  const max = Math.min(Math.max(Number(process.env.DB_POOL_MAX ?? 25) || 25, 5), 50);
  const client = postgres(connectionString, {
    prepare: false,
    max,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 15,
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Database = ReturnType<typeof createDb>['db'];

/** DB handle usable inside or outside a transaction. */
export type DbConn = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export * from './schema/index.js';
