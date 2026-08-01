import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Database = ReturnType<typeof createDb>['db'];

/** DB handle usable inside or outside a transaction. */
export type DbConn = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export * from './schema/index.js';
