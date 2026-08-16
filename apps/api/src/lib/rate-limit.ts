import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './supabase.js';
import { peekJwt, looksLikeLiveSession } from './jwt-peek.js';

/**
 * Rate limit cho bối cảnh Làng Đại Học.
 *
 * Ràng buộc quan trọng nhất: **cả ký túc xá đi ra internet bằng chung vài IP NAT**.
 * Ở quy mô 30k sinh viên, mọi giới hạn chặt theo IP sẽ khoá nhầm người dùng thật
 * hàng loạt — `docs/technical-06-ops.md` §6.4 đã ghi nhận đúng hiện tượng này.
 *
 * Nên chia làm hai tầng:
 *  - Theo IP: chỉ áp cho request CHƯA đăng nhập, và để mức rộng. Mục tiêu là chặn
 *    flood ẩn danh, không phải bóp lưu lượng thật.
 *  - Theo tài khoản: dùng cho phần đắt tiền sau khi đã xác thực. Đây mới là đơn vị
 *    đúng để giới hạn, và hoàn toàn miễn nhiễm với chuyện dùng chung IP.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Chuẩn hoá IP làm khoá.
 * IPv6 cấp cho mỗi thuê bao cả khối /64, đổi địa chỉ trong khối đó là chuyện vặt —
 * nên gộp về prefix /64, nếu không thì giới hạn theo IPv6 coi như không tồn tại.
 */
export function ipKey(req: Request): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  if (!ip.includes(':')) return ip;
  const groups = ip.split(':');
  return `${groups.slice(0, 4).join(':')}::/64`;
}

/**
 * Có vẻ là một phiên đăng nhập THẬT — dùng để quyết định có bỏ qua limiter theo IP.
 *
 * Bản đầu chỉ kiểm tra cookie CÓ TỒN TẠI, và đó là một lỗ hổng thật:
 * `curl -H "Cookie: ldh_access_token=x"` là bỏ qua được toàn bộ rate limit, chi phí
 * tấn công bằng 0. Nay phải đọc được payload JWT, có `sub` dạng UUID và `exp` còn
 * hạn thì mới được bỏ qua.
 *
 * KHÔNG kiểm chữ ký ở tầng này — cố ý. Kiểm chữ ký tốn CPU và phải tra JWKS, tức là
 * biến chính limiter thành thứ đắt tiền mà kẻ tấn công muốn ép ta chạy. Đọc lướt đủ
 * để chặn cookie bịa; token giả mạo tinh vi vẫn sẽ chết ở `requireAuth` ngay sau đó.
 */
function looksLikeRealSession(req: Request): boolean {
  const access = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
  if (looksLikeLiveSession(access)) return true;
  // Access token hết hạn nhưng refresh token còn hình dạng hợp lệ vẫn là phiên thật
  // (client sắp gọi refresh). Refresh token của Supabase KHÔNG phải JWT nên chỉ
  // kiểm được hình dạng — vì vậy đòi kèm access token đọc được, dù đã hết hạn.
  const refresh = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
  if (!refresh || refresh.length < 12 || refresh.length > 512) return false;
  return peekJwt(access) != null;
}

const RATE_LIMIT_BODY = {
  error: { message: 'Bạn thao tác hơi nhanh, vui lòng thử lại sau ít phút', code: 'RATE_LIMIT' },
};

function base(overrides: Partial<Options>): Partial<Options> {
  return {
    standardHeaders: true,
    legacyHeaders: false,
    message: RATE_LIMIT_BODY,
    ...overrides,
  };
}

/**
 * Lưới chặn nền cho toàn bộ /api — CHỈ để cắt flood bệnh hoạn, không để nắn lưu lượng.
 *
 * Chỉ tính request KHÔNG mang cookie phiên; người đã đăng nhập có giới hạn riêng
 * theo tài khoản ở các route đắt tiền.
 *
 * Vì sao ngưỡng cao như vậy — đây là bài học phải trả giá:
 * mốc 300/phút ban đầu bị đo thực tế cho thấy quá thấp. Nhà mạng di động Việt Nam
 * dùng CGNAT: hàng trăm đến hàng nghìn thuê bao Viettel/Vinaphone đi chung MỘT IPv4,
 * cộng thêm wifi ký túc xá cũng chung IP. Một khách ẩn danh mở app tiêu ~5 request
 * mỗi phút, nên 300/phút chỉ đủ cho khoảng 60 người — tức là giờ cao điểm sẽ khoá
 * nhầm nguyên cả toà nhà.
 *
 * 6.000/phút = 100 request/giây từ MỘT địa chỉ. Không người thật nào đạt mức đó, kể
 * cả cả nghìn người sau CGNAT (1.000 người × 5 = 5.000). Nhưng máy quét hay script
 * bơm request thì vượt trong vài giây. Đây là cầu chì cuối, còn chống DDoS thể tích
 * thật phải do Cloudflare đứng trước làm.
 *
 * Chỉnh được lúc đang có sự cố mà không cần deploy: đặt ANON_RATE_LIMIT_PER_MIN.
 */
export const ANON_LIMIT_PER_MIN = Math.max(
  60,
  Number(process.env.ANON_RATE_LIMIT_PER_MIN ?? 6_000) || 6_000,
);

/** Ước lượng số request/phút của MỘT khách ẩn danh đang mở app (dùng trong test). */
export const ANON_REQ_PER_MIN_PER_USER = 5;

export const anonymousFloodLimiter = rateLimit(
  base({
    windowMs: 60_000,
    limit: IS_PROD ? ANON_LIMIT_PER_MIN : 50_000,
    keyGenerator: ipKey,
    skip: looksLikeRealSession,
  }),
);

/**
 * Giới hạn theo tài khoản — đặt SAU requireAuth.
 * Rơi về IP khi chưa có req.user để không bao giờ mất khoá.
 */
export function perUserLimiter(opts: { windowMs: number; limit: number; devLimit?: number }) {
  return rateLimit(
    base({
      windowMs: opts.windowMs,
      limit: IS_PROD ? opts.limit : (opts.devLimit ?? opts.limit * 20),
      keyGenerator: (req: Request) => req.user?.id ?? ipKey(req),
    }),
  );
}

/**
 * Chống dò mật khẩu theo TÀI KHOẢN thay vì theo IP.
 *
 * `skipSuccessfulRequests` khiến chỉ lần đăng nhập SAI mới bị tính — người dùng
 * thật đăng nhập đúng bao nhiêu lần cũng không bị phạt, còn kẻ dò mật khẩu thì
 * hết lượt sau 10 lần sai cho mỗi email, dù có đổi IP bao nhiêu lần.
 */
export const loginIdentityLimiter = rateLimit(
  base({
    windowMs: 15 * 60 * 1000,
    limit: IS_PROD ? 10 : 200,
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request) => {
      const body = req.body as { identifier?: unknown; email?: unknown } | undefined;
      const raw = typeof body?.identifier === 'string' ? body.identifier : body?.email;
      const id = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      // Không có identifier thì request sẽ hỏng ở tầng schema — vẫn tính theo IP.
      return id ? `login:${id}` : `login-ip:${ipKey(req)}`;
    },
    message: {
      error: {
        message: 'Tài khoản này đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
        code: 'RATE_LIMIT',
      },
    },
  }),
);
