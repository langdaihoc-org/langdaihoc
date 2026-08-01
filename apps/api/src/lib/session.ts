import type { Response } from 'express';
import type { Session } from '@supabase/supabase-js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  COOKIE_OPTIONS,
} from '../lib/supabase.js';

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 phút — khớp jwt_expiry Supabase
const REFRESH_MAX_AGE_MS = 1 * 24 * 60 * 60 * 1000; // 1 ngày — session thường
const REFRESH_MAX_AGE_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày — nhớ đăng nhập

export function setSessionCookies(res: Response, session: Session, rememberMe = false) {
  const refreshMaxAge = rememberMe ? REFRESH_MAX_AGE_REMEMBER_MS : REFRESH_MAX_AGE_MS;

  res.cookie(ACCESS_TOKEN_COOKIE, session.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: ACCESS_MAX_AGE_MS,
  });

  res.cookie(REFRESH_TOKEN_COOKIE, session.refresh_token, {
    ...COOKIE_OPTIONS,
    maxAge: refreshMaxAge,
  });
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
  res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
}
