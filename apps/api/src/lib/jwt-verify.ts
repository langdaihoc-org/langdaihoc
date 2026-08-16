/**
 * Xác minh access token Supabase cục bộ qua JWKS — tránh round-trip GoTrue.
 *
 * Supabase GoTrue ký bằng ES256 (ECDSA P-256). JWKS tại:
 *   {SUPABASE_URL}/auth/v1/.well-known/jwks.json
 *
 * Key được cache vô thời hạn trong process. Khi xác minh lỗi 404/5xx thì
 * fallback sang `getUser` online (một lần) thay vì từ chối cứng.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { getSupabaseUrl } from './env.js';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let initError: unknown = null;

function getJwks() {
  if (jwks) return jwks;
  const url = new URL('/auth/v1/.well-known/jwks.json', getSupabaseUrl());
  jwks = createRemoteJWKSet(url);
  return jwks;
}

export interface LocalJwtPayload extends JWTPayload {
  /** Supabase user id */
  sub: string;
  email?: string;
  email_confirmed_at?: string | null;
  phone?: string;
  app_metadata?: { providers?: string[]; provider?: string };
  user_metadata?: Record<string, unknown>;
  role?: string;
}

/**
 * Xác minh token cục bộ.
 * - Trả về payload khi hợp lệ.
 * - Trả về `null` khi token hết hạn hoặc chữ ký sai → caller nên refresh.
 * - Ném lỗi khi JWKS fetch thất bại vĩnh viễn (mạng bị chặn hẳn).
 */
export async function verifyJwtLocally(token: string): Promise<LocalJwtPayload | null> {
  try {
    const { payload } = await jwtVerify<LocalJwtPayload>(token, getJwks(), {
      algorithms: ['ES256'],
    });
    return payload;
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    // Token hết hạn hoặc chữ ký sai — cần refresh hoặc re-login
    if (
      e.code === 'ERR_JWT_EXPIRED' ||
      e.code === 'ERR_JWS_INVALID' ||
      e.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' ||
      e.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' ||
      /**
       * `kid` không khớp khoá nào trong JWKS = TOKEN SAI, không phải hạ tầng hỏng.
       *
       * Trước đây hai mã này rơi xuống nhánh "lỗi infrastructure" bên dưới và bị
       * ném lên, khiến caller fallback sang `getUser` — tức là một HTTP call sang
       * Supabase Auth. Kẻ tấn công chỉ cần bịa `kid` ngẫu nhiên là ép được mỗi
       * request của mình thành một lượt gọi mạng tới GoTrue, mà GoTrue lại chạy
       * chung compute nano với chính DB.
       */
      e.code === 'ERR_JWKS_NO_MATCHING_KEY' ||
      e.code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS'
    ) {
      return null;
    }
    // Lỗi infrastructure (mạng, JWKS 5xx) — ghi log để alert, ném lên để fallback
    console.warn('[jwt-verify] JWKS error — falling back to remote verify:', e.message);
    initError = err;
    throw err;
  }
}

/** Đặt lại sau khi mạng khôi phục (chủ yếu cho test). */
export function resetJwksCache() {
  jwks = null;
  initError = null;
}

export { initError };
