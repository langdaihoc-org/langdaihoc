import type { Request } from 'express';
import { AppError } from '../middleware/error-handler.js';

/** Express 5 params may be string | string[] — normalize to a single string. */
export function paramId(req: Request, key = 'id'): string {
  const raw = req.params[key];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) {
    throw new AppError(400, `Thiếu tham số: ${key}`, 'BAD_REQUEST');
  }
  return id;
}
