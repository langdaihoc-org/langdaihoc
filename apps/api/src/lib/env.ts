/** Env helpers — production fail-closed (không fallback localhost). */

export const isProd = process.env.NODE_ENV === 'production';

/** Host/env trông như môi trường live (kể cả khi NODE_ENV bị set sai). */
export function looksLikeLiveDeploy(): boolean {
  if (isProd) return true;
  if (process.env.RAILWAY_ENVIRONMENT === 'production') return true;
  const frontend = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '').toLowerCase();
  if (
    frontend === 'https://langdaihoc.com.vn' ||
    frontend === 'https://www.langdaihoc.com.vn' ||
    frontend === 'https://langdaihoc.xyz' ||
    frontend === 'https://www.langdaihoc.xyz' ||
    frontend.endsWith('.vercel.app')
  ) {
    return true;
  }
  return false;
}

export function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

export function getFrontendUrl(): string {
  const v = process.env.FRONTEND_URL?.trim();
  if (v) return v.replace(/\/$/, '');
  if (isProd) throw new Error('FRONTEND_URL is required in production');
  return 'http://localhost:5173';
}

export function getDatabaseUrl(): string {
  const v = process.env.DATABASE_URL?.trim();
  if (v) return v;
  if (isProd) throw new Error('DATABASE_URL is required in production');
  return 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
}

export function getSupabaseUrl(): string {
  const v = process.env.SUPABASE_URL?.trim();
  if (v) return v;
  if (isProd) throw new Error('SUPABASE_URL is required in production');
  return 'http://127.0.0.1:55321';
}

export function buildCorsOrigins(frontendUrl: string, extra: string[]): string[] {
  const origins = new Set<string>([frontendUrl, ...extra]);
  // Chỉ thêm domain production khi FRONTEND_URL đúng là domain đó (hoặc qua CORS_ORIGINS).
  if (
    frontendUrl === 'https://langdaihoc.com.vn' ||
    frontendUrl === 'https://www.langdaihoc.com.vn'
  ) {
    origins.add('https://langdaihoc.com.vn');
    origins.add('https://www.langdaihoc.com.vn');
  }
  if (
    frontendUrl === 'https://langdaihoc.xyz' ||
    frontendUrl === 'https://www.langdaihoc.xyz'
  ) {
    origins.add('https://langdaihoc.xyz');
    origins.add('https://www.langdaihoc.xyz');
  }
  if (!isProd) {
    origins.add('http://localhost:5173');
    origins.add('http://localhost:5174');
  }
  return [...origins];
}
