/**
 * Đọc lướt payload JWT mà KHÔNG xác minh chữ ký.
 *
 * Chỉ dùng cho quyết định RẺ TIỀN và không cấp quyền:
 *  - có nên bỏ qua rate limit cho request này không;
 *  - token này còn hạn tới bao giờ (để đặt TTL cache);
 *  - token này có phải rác hoàn toàn không (để từ chối sớm, khỏi gọi mạng).
 *
 * TUYỆT ĐỐI không dùng để cấp quyền truy cập. Mọi đường cấp quyền phải đi qua
 * `verifyJwtLocally` (kiểm chữ ký bằng JWKS) hoặc Supabase `getUser`.
 */

export type PeekedJwt = {
  sub: string;
  /** Thời điểm hết hạn, mili-giây. `null` nếu token không khai `exp`. */
  expiresAtMs: number | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Token Supabase thật dài ~600–900 ký tự; chặn sớm chuỗi rác quá ngắn/quá dài. */
const MIN_LEN = 40;
const MAX_LEN = 4096;

/**
 * Trả về payload đã đọc lướt, hoặc `null` nếu token không thể là token thật.
 *
 * Cố ý rẻ: chỉ tách chuỗi và giải base64url, không mã hoá, không gọi mạng. Mục
 * đích là loại chuỗi rác trước khi chúng kịp tốn tài nguyên đắt hơn.
 */
export function peekJwt(token: string | null | undefined): PeekedJwt | null {
  if (!token) return null;
  if (token.length < MIN_LEN || token.length > MAX_LEN) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const decoded = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof decoded.sub !== 'string' || !UUID_RE.test(decoded.sub)) return null;
    return {
      sub: decoded.sub,
      expiresAtMs: typeof decoded.exp === 'number' ? decoded.exp * 1000 : null,
    };
  } catch {
    return null;
  }
}

/** Token đọc được, có `sub` hợp lệ, và chưa hết hạn. */
export function looksLikeLiveSession(token: string | null | undefined): boolean {
  const peeked = peekJwt(token);
  if (!peeked) return false;
  if (peeked.expiresAtMs == null) return false;
  return peeked.expiresAtMs > Date.now();
}
