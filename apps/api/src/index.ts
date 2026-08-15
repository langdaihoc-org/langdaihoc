import './load-env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createDb } from '@langdaihoc/database';
import { createSupabaseAdmin } from './lib/supabase.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/routes.js';
import { adminRouter } from './modules/admin/routes.js';
import { catalogRouter } from './modules/catalog/routes.js';
import { cartRouter } from './modules/cart/routes.js';
import { ordersRouter } from './modules/orders/routes.js';
import { buyerRouter } from './modules/buyer/routes.js';
import { sellerRouter } from './modules/seller/routes.js';
import { healthRouter } from './modules/health/routes.js';
import { scheduleDataRetention } from './jobs/data-retention.js';
import { buildCorsOrigins, getDatabaseUrl, getFrontendUrl, isProd } from './lib/env.js';
import { requireTrustedOrigin } from './middleware/csrf-origin.js';
import { anonymousFloodLimiter } from './lib/rate-limit.js';


const PORT = Number(process.env.PORT ?? 3001);
const FRONTEND_URL = getFrontendUrl();
const EXTRA_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DATABASE_URL = getDatabaseUrl();

const { db } = createDb(DATABASE_URL);
const supabaseAdmin = createSupabaseAdmin();

const app = express();

// Railway / reverse proxy — cần để rate-limit & req.ip đúng.
if (isProd || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(
  cors({
    origin: buildCorsOrigins(FRONTEND_URL, EXTRA_ORIGINS),
    credentials: true,
  }),
);

/**
 * Giới hạn body theo từng route thay vì một mức chung.
 *
 * Chỉ 3 endpoint upload cần body lớn (ảnh base64 5MB → JSON ~7MB). Trước đây mức
 * 7MB được áp cho TOÀN BỘ API, nghĩa là bắn body 7MB vào bất kỳ đường nào — kể cả
 * /api/health — server vẫn phải nhận, đệm và parse trọn gói. Vài chục request như
 * vậy là đủ làm cạn RAM một instance mà không cần đăng nhập.
 */
const UPLOAD_PATHS = new Set(['/api/admin/upload', '/api/buyer/upload', '/api/seller/upload']);
const uploadJson = express.json({ limit: '7mb' });
const standardJson = express.json({ limit: '100kb' });
app.use((req, res, next) => {
  if (UPLOAD_PATHS.has(req.path)) {
    uploadJson(req, res, next);
    return;
  }
  standardJson(req, res, next);
});

app.use(cookieParser());
app.use(requireTrustedOrigin);
// Đặt sau cookieParser: limiter cần đọc cookie phiên để bỏ qua người đã đăng nhập
// (KTX dùng chung IP NAT — chi tiết trong lib/rate-limit.ts).
app.use('/api', anonymousFloodLimiter);

app.locals.db = db;
app.locals.supabaseAdmin = supabaseAdmin;

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/buyer', buyerRouter);
app.use('/api/seller', sellerRouter);
app.use('/api/admin', adminRouter);

app.use(errorHandler);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on 0.0.0.0:${PORT}`);
  scheduleDataRetention(db, supabaseAdmin);
});

function shutdown(signal: string) {
  console.log(`${signal} received — shutting down`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export type AppLocals = typeof app.locals;
