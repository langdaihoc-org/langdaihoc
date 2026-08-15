import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './supabase.js';

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

function hasSessionCookie(req: Request): boolean {
  return Boolean(req.cookies?.[ACCESS_TOKEN_COOKIE] || req.cookies?.[REFRESH_TOKEN_COOKIE]);
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
 * Lưới chặn nền cho toàn bộ /api.
 *
 * Chỉ tính request KHÔNG mang cookie phiên. Người dùng đã đăng nhập được bỏ qua ở
 * tầng này vì họ dùng chung IP NAT với cả toà KTX — họ đã có giới hạn riêng theo
 * tài khoản ở các route đắt tiền. Mục tiêu ở đây là chặn kịch bản một máy quét
 * hoặc bơm request ẩn danh vào catalog / pulse.
 */
export const anonymousFloodLimiter = rateLimit(
  base({
    windowMs: 60_000,
    limit: IS_PROD ? 300 : 5_000,
    keyGenerator: ipKey,
    skip: hasSessionCookie,
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
