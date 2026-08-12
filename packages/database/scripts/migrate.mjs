/**
 * Chạy migration với log lỗi đầy đủ — `drizzle-kit migrate` nuốt lỗi SQL nên rất khó chẩn đoán.
 *
 * Dùng: railway run -s api -- node packages/database/scripts/migrate.mjs
 * (hoặc tự set DATABASE_URL; nếu thiếu sẽ đọc từ apps/api/.env)
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

if (!process.env.DATABASE_URL) {
  try {
    const envPath = new URL('../../../apps/api/.env', import.meta.url);
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  } catch {
    // không có .env cục bộ — bỏ qua
  }
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');

const folder = new URL('../drizzle', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await migrate(drizzle(sql), { migrationsFolder: folder });
  console.log('migrations applied');
} catch (err) {
  console.error('MIGRATION FAILED:', err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
