import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl, isProd } from './env.js';

export function createSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  }
  return createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createSupabaseAnon() {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error('SUPABASE_ANON_KEY is required');
  }
  return createClient(getSupabaseUrl(), anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const ACCESS_TOKEN_COOKIE = 'ldh_access_token';
export const REFRESH_TOKEN_COOKIE = 'ldh_refresh_token';

const sameSiteEnv = process.env.COOKIE_SAMESITE === 'none' ? 'none' : 'lax';
const secureRequested =
  isProd || process.env.COOKIE_SECURE === 'true' || sameSiteEnv === 'none';

if (sameSiteEnv === 'none' && !secureRequested) {
  throw new Error('COOKIE_SAMESITE=none yêu cầu COOKIE_SECURE=true (hoặc NODE_ENV=production)');
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: secureRequested,
  sameSite: sameSiteEnv as 'none' | 'lax',
  path: '/',
};
