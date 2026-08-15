import { describe, it, expect } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'node:net';
import type { Request } from 'express';
import { ipKey, anonymousFloodLimiter } from './rate-limit.js';

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

describe('anonymousFloodLimiter', () => {
  it('bỏ qua request mang cookie phiên, vẫn tính request ẩn danh', async () => {
    const app = express();
    app.use(cookieParser());
    app.use(anonymousFloodLimiter);
    app.get('/x', (_req, res) => {
      res.json({ ok: true });
    });
    const server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/x`;

    const anon = await fetch(url);
    const loggedIn = await fetch(url, { headers: { Cookie: 'ldh_access_token=abc' } });

    // Có header giới hạn = đang bị tính; không có = đã được bỏ qua.
    expect(anon.headers.get('ratelimit-limit')).not.toBeNull();
    expect(loggedIn.headers.get('ratelimit-limit')).toBeNull();

    await new Promise<void>((r) => server.close(() => r()));
  });
});
