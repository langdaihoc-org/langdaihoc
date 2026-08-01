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
import { assertDemoModeSafe, buildCorsOrigins, getDatabaseUrl, getFrontendUrl, isProd } from './lib/env.js';
import { requireTrustedOrigin } from './middleware/csrf-origin.js';

assertDemoModeSafe();

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
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use(requireTrustedOrigin);

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
