/**
 * Chặn script phá dữ liệu khi trỏ nhầm DB/API cloud.
 * Override (mọi môi trường, kể cả non-prod remote): ALLOW_DESTRUCTIVE=1 + CONFIRM_DESTRUCTIVE=I_UNDERSTAND
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

function looksLikeLiveTarget() {
  const db = process.env.DATABASE_URL ?? '';
  const api = process.env.API_URL ?? '';
  const supabase = process.env.SUPABASE_URL ?? '';
  const frontend = (process.env.FRONTEND_URL ?? '').toLowerCase();
  if (process.env.RAILWAY_ENVIRONMENT === 'production') return true;
  if (process.env.NODE_ENV === 'production') return true;
  if (/railway|supabase\.co|langdaihoc\.xyz|vercel\.app/.test(`${db} ${api} ${supabase} ${frontend}`)) {
    return true;
  }
  if ((db && !isLocalHost(db)) || (api && !isLocalHost(api)) || (supabase && !isLocalHost(supabase))) {
    return true;
  }
  return false;
}

export function assertLocalDestructive(label = 'script') {
  const allow = process.env.ALLOW_DESTRUCTIVE === '1';
  const confirmed = process.env.CONFIRM_DESTRUCTIVE === 'I_UNDERSTAND';

  if (looksLikeLiveTarget()) {
    if (!(allow && confirmed)) {
      console.error(
        `[${label}] Từ chối: đang trỏ môi trường live/remote. Cần ALLOW_DESTRUCTIVE=1 và CONFIRM_DESTRUCTIVE=I_UNDERSTAND`,
      );
      process.exit(1);
    }
    return;
  }

  // Local thuần: vẫn cần ALLOW_DESTRUCTIVE để tránh chạy nhầm.
  if (!allow) {
    console.error(`[${label}] Từ chối: set ALLOW_DESTRUCTIVE=1 để chạy script phá dữ liệu (local).`);
    process.exit(1);
  }
}
