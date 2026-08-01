import type { Request } from 'express';

/** Express 5 params may be string | string[] — normalize to a single string. */
export function paramId(req: Request, key = 'id'): string {
  const raw = req.params[key];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) throw new Error(`Missing route param: ${key}`);
  return id;
}
