import type { NextFunction, Request, Response } from 'express';
import { AppError } from './error-handler.js';
import { buildCorsOrigins, getFrontendUrl } from '../lib/env.js';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../lib/supabase.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedOrigins(): Set<string> {
  const extra = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(buildCorsOrigins(getFrontendUrl(), extra));
}

/**
 * Chống CSRF khi cookie session (đặc biệt SameSite=None cross-origin):
 * - Có cookie session → bắt buộc Origin hoặc Referer thuộc allowlist.
 * - Bearer-only (không cookie) → cho phép thiếu Origin (curl / native).
 */
export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
  if (SAFE.has(req.method)) {
    next();
    return;
  }

  const allowed = allowedOrigins();
  const origin = req.get('origin');
  if (origin) {
    if (!allowed.has(origin)) {
      next(new AppError(403, 'Origin không được phép', 'FORBIDDEN_ORIGIN'));
      return;
    }
    next();
    return;
  }

  const referer = req.get('referer');
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!allowed.has(refOrigin)) {
        next(new AppError(403, 'Origin không được phép', 'FORBIDDEN_ORIGIN'));
        return;
      }
      next();
      return;
    } catch {
      next(new AppError(403, 'Origin không được phép', 'FORBIDDEN_ORIGIN'));
      return;
    }
  }

  // Không Origin/Referer: chỉ cho qua nếu không gửi cookie session (Bearer / server-to-server).
  const hasSessionCookie = Boolean(
    req.cookies?.[ACCESS_TOKEN_COOKIE] || req.cookies?.[REFRESH_TOKEN_COOKIE],
  );
  if (hasSessionCookie) {
    next(new AppError(403, 'Thiếu Origin — từ chối request cookie', 'FORBIDDEN_ORIGIN'));
    return;
  }

  next();
}
