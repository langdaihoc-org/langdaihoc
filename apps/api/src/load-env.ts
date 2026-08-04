import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load .env trước mọi import dùng secrets / config.
 * Production: không override biến môi trường cloud (Railway/Vercel).
 */
const isProd = process.env.NODE_ENV === 'production';
if (!isProd) {
  config({
    path: join(dirname(fileURLToPath(import.meta.url)), '../.env'),
    override: true,
  });
} else {
  // Chỉ fill biến còn trống — không ghi đè env đã set trên host.
  config({
    path: join(dirname(fileURLToPath(import.meta.url)), '../.env'),
    override: false,
  });
}
