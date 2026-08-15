import type { NextFunction, Request, Response } from 'express';

/**
 * Micro-cache cho response GET công khai (catalog).
 *
 * Vì sao cần: `/api/catalog/home` chạy 6 truy vấn và là endpoint ai mở app cũng
 * gọi. Code đã đặt `Cache-Control: public, max-age=60` rất đúng, nhưng không có
 * CDN nào đứng trước Railway nên header đó chỉ có tác dụng với trình duyệt —
 * mọi lượt truy cập mới vẫn xuống thẳng DB. Đo thực tế: 1 request 235ms; 20
 * request đồng thời thì chậm nhất đã 540ms vì 120 lượt truy vấn tranh 10 kết nối.
 *
 * Hai cơ chế, cơ chế thứ hai mới chữa đúng bệnh:
 *
 *  1. TTL cache — trong TTL thì trả thẳng từ RAM, không chạm DB.
 *  2. Single-flight — N request cùng miss một key thì chỉ MỘT lượt chạy handler,
 *     N-1 lượt còn lại chờ chung kết quả đó. Thiếu bước này thì đúng lúc TTL hết
 *     hạn giữa giờ cao điểm, cả trăm request sẽ đồng loạt đâm xuống DB.
 *
 * CHỈ dùng cho route mà kết quả phụ thuộc DUY NHẤT vào URL. Bất kỳ endpoint nào
 * đọc `req.user` đều không được dùng — sẽ rò dữ liệu giữa các tài khoản.
 *
 * Tắt khẩn cấp không cần sửa code: đặt `CATALOG_CACHE_TTL_MS=0`.
 */

const ENABLED_TTL_MS = Math.max(0, Number(process.env.CATALOG_CACHE_TTL_MS ?? 30_000) || 0);
/** Trần số key — catalog có phân trang + tìm kiếm nên tập key là mở. */
const MAX_ENTRIES = Math.max(50, Number(process.env.CATALOG_CACHE_MAX ?? 500) || 500);

/**
 * Header được phát lại khi trả từ cache.
 *
 * Cố ý là allowlist chứ không sao chép tất cả: trả HIT nghĩa là dùng lại response
 * sinh ra cho MỘT request khác, nên phát lại nhầm `Set-Cookie` là gán phiên của
 * người này cho người kia. Chỉ những header mô tả chính nội dung mới an toàn.
 */
const REPLAY_HEADERS = ['cache-control', 'content-language'] as const;

type Entry = { body: unknown; headers: Record<string, string>; expiresAt: number };

const store = new Map<string, Entry>();
const inFlight = new Map<string, Promise<Entry>>();

function captureHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of REPLAY_HEADERS) {
    const v = res.getHeader(name);
    if (typeof v === 'string') out[name] = v;
  }
  return out;
}

function applyHeaders(res: Response, headers: Record<string, string>) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
}

let hits = 0;
let misses = 0;
let coalesced = 0;

function evictIfNeeded() {
  if (store.size < MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
  // Vẫn đầy sau khi dọn hết hạn → bỏ key cũ nhất (Map giữ thứ tự chèn).
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

/** Gọi sau khi sửa dữ liệu catalog nếu cần thấy thay đổi ngay, không đợi hết TTL. */
export function clearResponseCache() {
  store.clear();
}

export function responseCacheStats() {
  return { entries: store.size, inFlight: inFlight.size, ttlMs: ENABLED_TTL_MS, hits, misses, coalesced };
}

export function cachePublicGet(ttlMs = ENABLED_TTL_MS) {
  return function cacheMiddleware(req: Request, res: Response, next: NextFunction) {
    if (ENABLED_TTL_MS === 0 || ttlMs === 0 || req.method !== 'GET') {
      next();
      return;
    }

    const key = req.originalUrl;
    const cached = store.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      hits += 1;
      // Phải phát lại Cache-Control, nếu không thì mỗi lần HIT lại thành response
      // không cache được — trình duyệt (và CDN sau này) sẽ hỏi lại server mọi lượt,
      // tức là vô hiệu hoá đúng thứ `setPublicCatalogCache` đang cố làm.
      applyHeaders(res, cached.headers);
      res.setHeader('X-Cache', 'HIT');
      res.json(cached.body);
      return;
    }

    // Đã có một lượt đang chạy cho đúng key này → chờ ké, không chạy handler nữa.
    const pending = inFlight.get(key);
    if (pending) {
      coalesced += 1;
      res.setHeader('X-Cache', 'COALESCED');
      pending.then(
        (entry) => {
          if (res.headersSent) return;
          applyHeaders(res, entry.headers);
          res.json(entry.body);
        },
        () => {
          // Lượt dẫn đầu hỏng — request này tự chạy handler như bình thường.
          if (!res.headersSent) next();
        },
      );
      return;
    }

    misses += 1;
    let settle!: (entry: Entry) => void;
    let fail!: (err: unknown) => void;
    const promise = new Promise<Entry>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    // Nhánh reject có thể không ai await → chặn unhandled rejection làm sập process.
    promise.catch(() => {});
    inFlight.set(key, promise);

    let settled = false;
    const release = (ok: boolean, entry?: Entry) => {
      if (settled) return;
      settled = true;
      inFlight.delete(key);
      if (ok && entry) settle(entry);
      else fail(new Error('handler did not produce a cacheable response'));
    };

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode === 200) {
        evictIfNeeded();
        const entry: Entry = {
          body,
          headers: captureHeaders(res),
          expiresAt: Date.now() + ttlMs,
        };
        store.set(key, entry);
        res.setHeader('X-Cache', 'MISS');
        release(true, entry);
      } else {
        // Lỗi thì không cache, và không để request đang chờ nhận nhầm body lỗi.
        release(false);
      }
      return originalJson(body);
    }) as Response['json'];

    // Handler ném lỗi, hoặc client ngắt giữa chừng → phải nhả single-flight,
    // nếu không mọi request sau cho key này sẽ treo vĩnh viễn.
    res.on('close', () => release(false));

    next();
  };
}
