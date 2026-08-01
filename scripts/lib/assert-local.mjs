/**
 * Chặn script phá dữ liệu khi trỏ nhầm DB/API cloud.
 * Override production: ALLOW_DESTRUCTIVE=1 + CONFIRM_DESTRUCTIVE=I_UNDERSTAND
 * Override non-local DB/API (dev): ALLOW_DESTRUCTIVE=1
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadApiEnv(root = join(dirname(fileURLToPath(import.meta.url)), '../..')) {
  try {
    const text = readFileSync(join(root, 'apps/api/.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] == null) process.env[m[1]] = m[2];
    }
  } catch {
    /* optional */
  }
}

function isLocalHost(value) {
  if (!value) return false;
  try {
    const u = new URL(value.includes('://') ? value : `http://${value}`);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  } catch {
    return /127\.0\.0\.1|localhost/.test(value);
  }
}

export function assertLocalDestructive(label = 'script') {
  const allow = process.env.ALLOW_DESTRUCTIVE === '1';
  const confirmed = process.env.CONFIRM_DESTRUCTIVE === 'I_UNDERSTAND';

  if (process.env.NODE_ENV === 'production') {
    if (!(allow && confirmed)) {
      console.error(
        `[${label}] Từ chối: NODE_ENV=production. Cần ALLOW_DESTRUCTIVE=1 và CONFIRM_DESTRUCTIVE=I_UNDERSTAND`,
      );
      process.exit(1);
    }
    return;
  }

  if (allow) return;

  const db = process.env.DATABASE_URL ?? '';
  const api = process.env.API_URL ?? process.env.SUPABASE_URL ?? '';
  if (db && !isLocalHost(db)) {
    console.error(`[${label}] Từ chối: DATABASE_URL không phải localhost. Override: ALLOW_DESTRUCTIVE=1`);
    process.exit(1);
  }
  if (api && !/localhost|127\.0\.0\.1/.test(api)) {
    console.error(`[${label}] Từ chối: API/Supabase không phải local. Override: ALLOW_DESTRUCTIVE=1`);
    process.exit(1);
  }
}
