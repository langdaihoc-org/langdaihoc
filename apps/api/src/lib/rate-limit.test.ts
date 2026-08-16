import { describe, it, expect } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'node:net';
import type { Request } from 'express';
import {
  ipKey,
  anonymousFloodLimiter,
  ANON_LIMIT_PER_MIN,
  ANON_REQ_PER_MIN_PER_USER,
} from './rate-limit.js';

/**
 * Ràng buộc nền của bối cảnh này: cả ký túc xá đi ra internet bằng chung vài IP
 * NAT. Nên hai tính chất dưới đây phải giữ được, nếu vỡ là khoá nhầm sinh viên
 * thật hàng loạt vào đúng giờ cao điểm:
 *
 *  - người ĐÃ đăng nhập không bị tính vào giới hạn theo IP;
 *  - IPv6 phải gộp theo /64, nếu không thì đổi địa chỉ cuối là né được giới hạn.
 */

function fakeReq(over: Partial<Request>): Request {
  return { socket: {}, ...over } as Request;
}

describe('ipKey', () => {
  it('giữ nguyên IPv4', () => {
    expect(ipKey(fakeReq({ ip: '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('gộp IPv6 cùng khối /64 về một khoá', () => {
    const a = ipKey(fakeReq({ ip: '2001:db8:1234:5678:aaaa:bbbb:cccc:dddd' }));
    const b = ipKey(fakeReq({ ip: '2001:db8:1234:5678:1111:2222:3333:4444' }));
    expect(a).toBe(b);
  });

  it('khối /64 khác nhau thì khoá khác nhau', () => {
    const a = ipKey(fakeReq({ ip: '2001:db8:1234:5678:aaaa:bbbb:cccc:dddd' }));
    const b = ipKey(fakeReq({ ip: '2001:db8:1234:9999:aaaa:bbbb:cccc:dddd' }));
    expect(a).not.toBe(b);
  });

  it('không có IP thì vẫn trả khoá dùng được, không ném lỗi', () => {
    expect(ipKey(fakeReq({}))).toBe('unknown');
  });
});

describe('ngưỡng chặn ẩn danh phải sống được sau CGNAT', () => {
  /**
   * Nhà mạng di động Việt Nam dùng CGNAT — hàng trăm đến hàng nghìn thuê bao đi
   * chung một IPv4. Wifi ký túc xá cũng vậy. Đo thực tế trên production cho thấy
   * mốc 300/phút bị chạm trần ngay, nên test này khoá lại bài học đó: ai hạ ngưỡng
   * xuống dưới mức an toàn sẽ thấy test đỏ kèm lý do, thay vì phát hiện lúc sinh
   * viên đồng loạt bị 429 giữa giờ cao điểm.
   */
  const NHOM_CGNAT_HOP_LY = 500;

  it('đủ chỗ cho một đám đông ẩn danh sau chung một IP', () => {
    const canToiThieu = NHOM_CGNAT_HOP_LY * ANON_REQ_PER_MIN_PER_USER;
    expect(ANON_LIMIT_PER_MIN).toBeGreaterThanOrEqual(canToiThieu);
  });

  it('vẫn đủ thấp để cắt flood từ một máy', () => {
    // Một script rẻ tiền dễ dàng đạt 500+ req/giây = 30.000/phút.
    expect(ANON_LIMIT_PER_MIN).toBeLessThan(30_000);
  });
});

/** Dựng một access token ĐÚNG HÌNH DẠNG (không cần chữ ký thật) để test. */
function fakeAccessToken(opts: { sub?: string; expInSec?: number } = {}) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'ES256', typ: 'JWT' });
  const body = b64({
    sub: opts.sub ?? '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    exp: Math.floor(Date.now() / 1000) + (opts.expInSec ?? 900),
  });
  // Chữ ký chỉ cần là chuỗi đủ dài — tầng này cố ý KHÔNG kiểm chữ ký.
  return `${head}.${body}.${'s'.repeat(43)}`;
}

describe('anonymousFloodLimiter', () => {
  async function startLimiterApp() {
    const app = express();
    app.use(cookieParser());
    app.use(anonymousFloodLimiter);
    app.get('/x', (_req, res) => {
      res.json({ ok: true });
    });
    const server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    const { port } = server.address() as AddressInfo;
    return {
      url: `http://127.0.0.1:${port}/x`,
      close: () => new Promise<void>((r) => server.close(() => r())),
    };
  }

  /** Có header giới hạn = đang bị tính; không có = đã được bỏ qua. */
  const biTinh = (r: Response) => r.headers.get('ratelimit-limit') !== null;

  it('vẫn tính request ẩn danh', async () => {
    const srv = await startLimiterApp();
    expect(biTinh(await fetch(srv.url))).toBe(true);
    await srv.close();
  });

  it('bỏ qua phiên đăng nhập thật', async () => {
    const srv = await startLimiterApp();
    const r = await fetch(srv.url, { headers: { Cookie: `ldh_access_token=${fakeAccessToken()}` } });
    expect(biTinh(r)).toBe(false);
    await srv.close();
  });

  it('KHÔNG bỏ qua cookie bịa — đây từng là lỗ hổng bỏ qua toàn bộ rate limit', async () => {
    const srv = await startLimiterApp();
    for (const bia of ['abc', 'x', 'a.b.c', 'Bearer', 'null', 'a'.repeat(200)]) {
      const r = await fetch(srv.url, { headers: { Cookie: `ldh_access_token=${bia}` } });
      expect(biTinh(r), `cookie bịa "${bia.slice(0, 12)}" phải bị tính`).toBe(true);
    }
    await srv.close();
  });

  it('KHÔNG bỏ qua token đã hết hạn mà không kèm refresh token', async () => {
    const srv = await startLimiterApp();
    const hetHan = fakeAccessToken({ expInSec: -60 });
    const r = await fetch(srv.url, { headers: { Cookie: `ldh_access_token=${hetHan}` } });
    expect(biTinh(r)).toBe(true);
    await srv.close();
  });

  it('bỏ qua token hết hạn NHƯNG có refresh token — client sắp gia hạn', async () => {
    const srv = await startLimiterApp();
    const hetHan = fakeAccessToken({ expInSec: -60 });
    const r = await fetch(srv.url, {
      headers: { Cookie: `ldh_access_token=${hetHan}; ldh_refresh_token=${'r'.repeat(40)}` },
    });
    expect(biTinh(r)).toBe(false);
    await srv.close();
  });

  it('KHÔNG bỏ qua khi chỉ có mỗi refresh token bịa', async () => {
    const srv = await startLimiterApp();
    const r = await fetch(srv.url, { headers: { Cookie: `ldh_refresh_token=${'r'.repeat(40)}` } });
    expect(biTinh(r)).toBe(true);
    await srv.close();
  });
});
