#!/usr/bin/env node
/**
 * Chặn `drizzle-kit generate` / `push` khi snapshot của drizzle-kit đã lệch khỏi
 * schema thật.
 *
 * Bối cảnh: từ migration 0002 trở đi, mọi thay đổi schema của dự án đều được viết
 * tay bằng SQL. Drizzle-kit không sinh snapshot cho những lần đó, nên chuỗi
 * snapshot trong `drizzle/meta/` dừng lại ở 0001 — nó chỉ biết 22 bảng trong khi
 * schema hiện có 32, và biết 13 index trong khi DB thật có hơn 50.
 *
 * Hệ quả nếu chạy bừa:
 *  - `generate` sinh ra migration đòi CREATE lại 12 bảng đã tồn tại;
 *  - `push` so schema với DB thật rồi DROP những index nó không biết — bao gồm
 *    các partial index đang giữ cho pulse và counter chạy O(1).
 *
 * Muốn bỏ chặn thì phải làm baseline reset trước (cần kết nối DB thật để đối
 * chiếu) — xem mục DB-01 trong kế hoạch tối ưu. Sau khi baseline đúng, script này
 * tự động hết chặn vì số bảng sẽ khớp.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(here, '..');
const metaDir = path.join(pkgRoot, 'drizzle', 'meta');
const schemaDir = path.join(pkgRoot, 'src', 'schema');

function tablesInSchema() {
  const found = new Set();
  for (const file of readdirSync(schemaDir)) {
    if (!file.endsWith('.ts')) continue;
    const src = readFileSync(path.join(schemaDir, file), 'utf8');
    for (const m of src.matchAll(/pgTable\(\s*'([^']+)'/g)) found.add(m[1]);
  }
  return found;
}

function tablesInLatestSnapshot() {
  const snapshots = readdirSync(metaDir)
    .filter((f) => f.endsWith('_snapshot.json'))
    .sort();
  const latest = snapshots.at(-1);
  if (!latest) return { name: null, tables: new Set() };
  const snap = JSON.parse(readFileSync(path.join(metaDir, latest), 'utf8'));
  const tables = new Set(Object.keys(snap.tables ?? {}).map((t) => t.split('.').at(-1)));
  return { name: latest, tables };
}

const schema = tablesInSchema();
const { name: snapshotName, tables: snapshot } = tablesInLatestSnapshot();
const missing = [...schema].filter((t) => !snapshot.has(t)).sort();

if (missing.length === 0) {
  process.exit(0);
}

if (process.env.ALLOW_DRIZZLE_GENERATE === '1') {
  console.warn(
    `\n[db] CẢNH BÁO: snapshot lệch ${missing.length} bảng nhưng ALLOW_DRIZZLE_GENERATE=1 — vẫn chạy tiếp.\n`,
  );
  process.exit(0);
}

const list = missing.map((t) => `    - ${t}`).join('\n');
console.error(`
╔════════════════════════════════════════════════════════════════════╗
║  ĐÃ CHẶN: snapshot drizzle-kit không khớp schema thật              ║
╚════════════════════════════════════════════════════════════════════╝

  Snapshot mới nhất : ${snapshotName ?? '(không có)'}
  Bảng trong snapshot: ${snapshot.size}
  Bảng trong schema  : ${schema.size}

  ${missing.length} bảng có trong schema nhưng snapshot không biết:
${list}

  Vì sao chặn: từ migration 0002 trở đi, schema được sửa bằng SQL viết tay nên
  drizzle-kit không theo kịp. Chạy tiếp sẽ:
    • generate → sinh migration đòi CREATE lại các bảng đã tồn tại;
    • push     → DROP những index nó không biết, gồm cả các partial index đang
                 giữ cho pulse/counter chạy O(1).

  Cách làm đúng khi cần đổi schema:
    1. Viết file SQL mới trong packages/database/drizzle/ (theo đúng nếp hiện tại)
    2. Khai báo tương ứng trong packages/database/src/schema/
    3. pnpm db:migrate   ← lệnh này AN TOÀN, chỉ áp các file SQL đã có

  Muốn dùng lại generate/push thì phải baseline reset trước (cần đối chiếu với DB
  thật) — xem mục DB-01 trong kế hoạch tối ưu.

  Biết rõ mình đang làm gì: ALLOW_DRIZZLE_GENERATE=1 pnpm db:generate
`);
process.exit(1);
