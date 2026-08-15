import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { cachePublicGet, clearResponseCache } from './response-cache.js';

/**
 * Cache này đứng trước endpoint đông nhất hệ thống (`/api/catalog/home`), nên
 * bốn tính chất dưới đây phải đúng tuyệt đối:
 *
 *  - trong TTL thì không được chạy lại handler (nếu không thì cache vô nghĩa);
 *  - nhiều request cùng lúc chỉ được chạy handler MỘT lần (single-flight — đây
 *    mới là thứ chữa hiện tượng 20 request đồng thời cùng đâm xuống DB);
 *  - response lỗi tuyệt đối không được cache (nếu không, một lần DB chập chờn sẽ
 *    được phục vụ lại cho mọi người trong suốt TTL);
 *  - handler ném lỗi thì phải nhả single-flight, không được để request sau treo.
 */

type Server = { url: string; close: () => Promise<void> };

async function startApp(build: (app: express.Express) => void): Promise<Server> {
  const app = express();
  build(app);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

beforeEach(() => {
  clearResponseCache();
});

describe('cachePublicGet', () => {
  it('chỉ chạy handler một lần trong TTL, lần sau trả từ cache', async () => {
    const handler = vi.fn((_req: express.Request, res: express.Response) => {
      res.json({ n: handler.mock.calls.length });
    });
    const srv = await startApp((app) => {
      app.use(cachePublicGet(5_000));
      app.get('/x', handler);
    });

    const first = await fetch(`${srv.url}/x`);
    const second = await fetch(`${srv.url}/x`);

    expect(first.headers.get('x-cache')).toBe('MISS');
    expect(second.headers.get('x-cache')).toBe('HIT');
    expect(await second.json()).toEqual({ n: 1 });
    expect(handler).toHaveBeenCalledTimes(1);

    await srv.close();
  });

  it('phân biệt cache theo query string', async () => {
    const handler = vi.fn((req: express.Request, res: express.Response) => {
      res.json({ q: req.query.q ?? null });
    });
    const srv = await startApp((app) => {
      app.use(cachePublicGet(5_000));
      app.get('/x', handler);
    });

    expect(await (await fetch(`${srv.url}/x?q=pho`)).json()).toEqual({ q: 'pho' });
    expect(await (await fetch(`${srv.url}/x?q=com`)).json()).toEqual({ q: 'com' });
    expect(handler).toHaveBeenCalledTimes(2);

    await srv.close();
  });

  it('gộp các request đồng thời vào một lượt chạy handler', async () => {
    let running = 0;
    let maxConcurrent = 0;
    const handler = vi.fn(async (_req: express.Request, res: express.Response) => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await new Promise((r) => setTimeout(r, 60));
      running -= 1;
      res.json({ ok: true });
    });
    const srv = await startApp((app) => {
      app.use(cachePublicGet(5_000));
      app.get('/x', (req, res) => void handler(req, res));
    });

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => fetch(`${srv.url}/x`)),
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);
    // Đây là điểm mấu chốt: 20 request đồng thời nhưng chỉ 1 lượt chạm DB.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(maxConcurrent).toBe(1);
    const modes = responses.map((r) => r.headers.get('x-cache'));
    expect(modes.filter((m) => m === 'MISS')).toHaveLength(1);
    expect(modes.filter((m) => m === 'COALESCED')).toHaveLength(19);

    await srv.close();
  });

  it('giữ nguyên Cache-Control khi trả từ cache', async () => {
    const srv = await startApp((app) => {
      app.use(cachePublicGet(5_000));
      app.get('/x', (_req, res) => {
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.json({ ok: true });
      });
    });

    const miss = await fetch(`${srv.url}/x`);
    const hit = await fetch(`${srv.url}/x`);

    // Mất header này thì trình duyệt/CDN phải hỏi lại server ở mọi lượt HIT,
    // tức là vô hiệu hoá đúng thứ setPublicCatalogCache đang cố làm.
    expect(miss.headers.get('cache-control')).toBe('public, max-age=60');
    expect(hit.headers.get('x-cache')).toBe('HIT');
    expect(hit.headers.get('cache-control')).toBe('public, max-age=60');

    await srv.close();
  });

  it('không bao giờ phát lại Set-Cookie từ cache', async () => {
    const srv = await startApp((app) => {
      app.use(cachePublicGet(5_000));
      app.get('/x', (_req, res) => {
        res.setHeader('Set-Cookie', 'phien=cua-nguoi-dau-tien');
        res.json({ ok: true });
      });
    });

    await fetch(`${srv.url}/x`);
    const hit = await fetch(`${srv.url}/x`);

    // Phát lại Set-Cookie là gán phiên của người này cho người kia.
    expect(hit.headers.get('x-cache')).toBe('HIT');
    expect(hit.headers.get('set-cookie')).toBeNull();

    await srv.close();
  });

  it('không cache response lỗi', async () => {
    let hits = 0;
    const srv = await startApp((app) => {
      app.use(cachePublicGet(5_000));
      app.get('/x', (_req, res) => {
        hits += 1;
        res.status(500).json({ error: 'boom' });
      });
    });

    const first = await fetch(`${srv.url}/x`);
    const second = await fetch(`${srv.url}/x`);

    expect(first.status).toBe(500);
    expect(second.status).toBe(500);
    expect(second.headers.get('x-cache')).not.toBe('HIT');
    expect(hits).toBe(2);

    await srv.close();
  });

  it('handler ném lỗi thì request sau vẫn chạy được, không treo', async () => {
    let calls = 0;
    const srv = await startApp((app) => {
      app.use(cachePublicGet(5_000));
      app.get('/x', (_req, res, next) => {
        calls += 1;
        if (calls === 1) {
          next(new Error('lỗi tạm thời'));
          return;
        }
        res.json({ ok: true });
      });
      app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
      });
    });

    expect((await fetch(`${srv.url}/x`)).status).toBe(500);
    const second = await fetch(`${srv.url}/x`);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true });

    await srv.close();
  });

  it('hết TTL thì chạy lại handler', async () => {
    const handler = vi.fn((_req: express.Request, res: express.Response) => {
      res.json({ ok: true });
    });
    const srv = await startApp((app) => {
      app.use(cachePublicGet(50));
      app.get('/x', handler);
    });

    await fetch(`${srv.url}/x`);
    await new Promise((r) => setTimeout(r, 80));
    const after = await fetch(`${srv.url}/x`);

    expect(after.headers.get('x-cache')).toBe('MISS');
    expect(handler).toHaveBeenCalledTimes(2);

    await srv.close();
  });

  it('không đụng vào request không phải GET', async () => {
    const handler = vi.fn((_req: express.Request, res: express.Response) => {
      res.json({ ok: true });
    });
    const srv = await startApp((app) => {
      app.use(cachePublicGet(5_000));
      app.post('/x', handler);
    });

    await fetch(`${srv.url}/x`, { method: 'POST' });
    const second = await fetch(`${srv.url}/x`, { method: 'POST' });

    expect(second.headers.get('x-cache')).toBeNull();
    expect(handler).toHaveBeenCalledTimes(2);

    await srv.close();
  });
});
