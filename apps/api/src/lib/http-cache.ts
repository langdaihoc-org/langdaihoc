import type { Response } from 'express';

/**
 * Cache ngắn cho catalog guest (không auth, dữ liệu công khai).
 * private+no-cache vẫn dùng cho endpoints có cookie/session.
 */
export function setPublicCatalogCache(res: Response, maxAgeSec = 30) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAgeSec}, stale-while-revalidate=${maxAgeSec * 2}`,
  );
}
