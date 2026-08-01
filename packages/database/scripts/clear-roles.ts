/**
 * Clear all multi-role memberships (user_roles).
 * Primary role on profiles stays — login vẫn dùng profiles.role.
 * Chỉ local (hoặc ALLOW_DESTRUCTIVE=1).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, userRoles } from '../src/index.js';
import { assertLocalDestructive, loadApiEnv } from '../../../scripts/lib/assert-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
loadApiEnv(root);
assertLocalDestructive('clear-roles');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const { db, client } = createDb(url);
const removed = await db.delete(userRoles).returning({ id: userRoles.id, userId: userRoles.userId, role: userRoles.role });
console.log(`Cleared ${removed.length} user_roles row(s):`);
for (const r of removed) console.log(`  - ${r.userId} · ${r.role}`);
await client.end({ timeout: 5 });
