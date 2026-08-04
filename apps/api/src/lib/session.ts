import type { Request, Response } from 'express';
import type { Session } from '@supabase/supabase-js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  COOKIE_OPTIONS,
} from '../lib/supabase.js';

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 phút — khớp jwt_expiry Supabase
const REFRESH_MAX_AGE_MS = 1 * 24 * 60 * 60 * 1000; // 1 ngày — session thường
const REFRESH_MAX_AGE_REMEMBER_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày — ghi nhớ đăng nhập

export const REMEMBER_COOKIE = 'ldh_remember';

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

  if (rememberMe) {
    res.cookie(REMEMBER_COOKIE, '1', {
      ...COOKIE_OPTIONS,
      maxAge: refreshMaxAge,
    });
  } else {
    res.clearCookie(REMEMBER_COOKIE, COOKIE_OPTIONS);
  }
}

/** Cookie ngắn hạn chỉ để đổi mật khẩu sau verify-recovery — không trả token ra JSON. */
export function setRecoveryCookies(res: Response, session: Session) {
  res.cookie(ACCESS_TOKEN_COOKIE, session.access_token, {
    ...COOKIE_OPTIONS,
    maxAge: ACCESS_MAX_AGE_MS,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, session.refresh_token, {
    ...COOKIE_OPTIONS,
    maxAge: ACCESS_MAX_AGE_MS,
  });
  res.clearCookie(REMEMBER_COOKIE, COOKIE_OPTIONS);
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
  res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
  res.clearCookie(REMEMBER_COOKIE, COOKIE_OPTIONS);
}

export function wantsRememberMe(req: Request): boolean {
  return req.cookies?.[REMEMBER_COOKIE] === '1';
}
