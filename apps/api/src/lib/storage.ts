import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import { getSupabaseUrl, isProd } from './env.js';
import { getR2Config, putR2Object, r2PublicOrigins, deleteR2Object, parseR2PublicKey } from './r2.js';

export const PUBLIC_BUCKETS = [
  'food-images',
  'laundry-images',
  'post-images',
  'banner-images',
] as const;

/** Chứng từ CK / bằng chứng khiếu nại — private (signed URL). */
export const PRIVATE_BUCKETS = ['payment-proofs'] as const;

export const ALL_BUCKETS = [...PUBLIC_BUCKETS, ...PRIVATE_BUCKETS] as const;
export type StorageBucket = (typeof ALL_BUCKETS)[number];

const ALLOWED_IMAGE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const;

export type AllowedImageContentType = keyof typeof ALLOWED_IMAGE;

export const imageContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const STORAGE_PUBLIC_MARKER = '/storage/v1/object/public/';
const STORAGE_SIGN_MARKER = '/storage/v1/object/sign/';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Signed URL ngắn — API re-sign khi đọc chi tiết đơn. */
const PROOF_SIGN_SECONDS = 60 * 60 * 24; // 24 giờ

let warnedMissingR2 = false;
/** Bucket đã xác nhận tồn tại đúng public/private trong tiến trình này — tránh gọi listBuckets() mỗi lần upload. */
const ensuredBuckets = new Set<StorageBucket>();

export type SupabaseObjectRef = {
  bucket: StorageBucket;
  path: string;
  kind: 'public' | 'sign';
};

function supabaseOrigins(): string[] {
  const raw = getSupabaseUrl();
  try {
    const u = new URL(raw);
    const origins = new Set<string>([u.origin]);
    if (u.hostname === '127.0.0.1') {
      origins.add(`${u.protocol}//localhost${u.port ? `:${u.port}` : ''}`);
    } else if (u.hostname === 'localhost') {
      origins.add(`${u.protocol}//127.0.0.1${u.port ? `:${u.port}` : ''}`);
    }
    return [...origins];
  } catch {
    return [raw.replace(/\/$/, '')];
  }
}

function isPrivateBucket(bucket: string): boolean {
  return (PRIVATE_BUCKETS as readonly string[]).includes(bucket);
}

function isPublicBucket(bucket: string): boolean {
  return (PUBLIC_BUCKETS as readonly string[]).includes(bucket);
}

function r2EnabledForPublic(): boolean {
  return getR2Config() != null;
}

function sniffImageContentType(buffer: Buffer): AllowedImageContentType | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Decode base64, kiểm tra size + magic bytes khớp contentType khai báo. */
export function parseImageUpload(dataBase64: string, contentType: string) {
  const ct = imageContentTypeSchema.parse(contentType);
  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new AppError(400, 'Ảnh tối đa 5MB', 'FILE_TOO_LARGE');
  }
  const sniffed = sniffImageContentType(buffer);
  if (!sniffed || sniffed !== ct) {
    throw new AppError(400, 'File không phải ảnh hợp lệ (jpeg/png/webp/gif)', 'INVALID_IMAGE');
  }
  return { buffer, contentType: ct, ext: ALLOWED_IMAGE[ct] };
}

export function safeUploadFileName(fileName: string | undefined, ext: string) {
  const raw = (fileName ?? 'image').replace(/\.[a-z0-9]+$/i, '');
  const base = raw.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 80) || 'image';
  return `${base}.${ext}`;
}

async function ensureBucket(supabase: SupabaseClient, bucket: StorageBucket) {
  if (ensuredBuckets.has(bucket)) return;
  const wantPublic = !isPrivateBucket(bucket);
  const { data: buckets } = await supabase.storage.listBuckets();
  const existing = buckets?.find((b) => b.name === bucket);
  if (existing) {
    if (Boolean(existing.public) !== wantPublic) {
      const { error } = await supabase.storage.updateBucket(bucket, { public: wantPublic });
      if (error) {
        console.error(`updateBucket ${bucket}:`, error.message);
        return;
      }
    }
    ensuredBuckets.add(bucket);
    return;
  }
  const { error } = await supabase.storage.createBucket(bucket, { public: wantPublic });
  if (error && !error.message.includes('already exists')) {
    console.error(`createBucket ${bucket}:`, error.message);
    throw new AppError(500, 'Không tạo được kho ảnh', 'STORAGE_ERROR');
  }
  ensuredBuckets.add(bucket);
}

async function uploadToSupabase(
  supabase: SupabaseClient,
  bucket: StorageBucket,
  path: string,
  buffer: Buffer,
  contentType: AllowedImageContentType,
) {
  await ensureBucket(supabase, bucket);
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) {
    console.error(`upload ${bucket}/${path}:`, error.message);
    throw new AppError(500, 'Upload thất bại', 'STORAGE_ERROR');
  }

  if (isPrivateBucket(bucket)) {
    const { data, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, PROOF_SIGN_SECONDS);
    if (signErr || !data?.signedUrl) {
      console.error(`sign ${bucket}/${path}:`, signErr?.message);
      throw new AppError(500, 'Upload thất bại', 'STORAGE_ERROR');
    }
    return data.signedUrl;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadPublicToR2(
  bucket: StorageBucket,
  path: string,
  buffer: Buffer,
  contentType: AllowedImageContentType,
) {
  const key = `${bucket}/${path}`.replace(/\/+/g, '/');
  try {
    return await putR2Object(key, buffer, contentType);
  } catch (err) {
    console.error(`r2 upload ${key}:`, err instanceof Error ? err.message : err);
    throw new AppError(500, 'Upload thất bại', 'STORAGE_ERROR');
  }
}

/**
 * Public buckets → R2 (nếu cấu hình), không thì Supabase.
 * Private (`payment-proofs`) → luôn Supabase signed URL.
 */
export async function uploadImage(
  supabase: SupabaseClient,
  bucket: StorageBucket,
  path: string,
  buffer: Buffer,
  contentType: AllowedImageContentType,
) {
  if (isPrivateBucket(bucket)) {
    return uploadToSupabase(supabase, bucket, path, buffer, contentType);
  }

  if (r2EnabledForPublic()) {
    return uploadPublicToR2(bucket, path, buffer, contentType);
  }

  if (isProd && !warnedMissingR2) {
    warnedMissingR2 = true;
    console.warn(
      '[storage] R2 chưa cấu hình — ảnh public dùng Supabase. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL.',
    );
  }

  return uploadToSupabase(supabase, bucket, path, buffer, contentType);
}

/** Parse URL Supabase Storage → bucket + object path (bỏ query token). */
export function parseSupabaseStorageUrl(url: string): SupabaseObjectRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (!supabaseOrigins().includes(parsed.origin)) return null;
  const path = parsed.pathname;
  const publicIdx = path.indexOf(STORAGE_PUBLIC_MARKER);
  const signIdx = path.indexOf(STORAGE_SIGN_MARKER);
  let after = '';
  let kind: 'public' | 'sign';
  if (publicIdx >= 0) {
    after = path.slice(publicIdx + STORAGE_PUBLIC_MARKER.length);
    kind = 'public';
  } else if (signIdx >= 0) {
    after = path.slice(signIdx + STORAGE_SIGN_MARKER.length);
    kind = 'sign';
  } else {
    return null;
  }
  const parts = after.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const bucket = parts[0];
  if (!bucket || !(ALL_BUCKETS as readonly string[]).includes(bucket)) return null;
  const objectPath = parts.slice(1).join('/');
  if (!objectPath) return null;
  return { bucket: bucket as StorageBucket, path: objectPath, kind };
}

function isSupabaseStorageUrl(parsed: URL): boolean {
  return parseSupabaseStorageUrl(parsed.toString()) != null;
}

/** URL public R2: `{base}/{bucket}/{...}` với bucket trong PUBLIC_BUCKETS. */
function isR2PublicUrl(parsed: URL): boolean {
  if (!r2PublicOrigins().includes(parsed.origin)) return false;
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return false;
  const bucket = decodeURIComponent(segments[0]!);
  return isPublicBucket(bucket);
}

/**
 * Chỉ chấp nhận URL ảnh đã upload lên storage của dự án
 * (Supabase origin + R2 public base — không tin host giả).
 */
export function isUploadedImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  return isSupabaseStorageUrl(parsed) || isR2PublicUrl(parsed);
}

/** Biên lai / bằng chứng: chỉ signed URL trong bucket payment-proofs. */
export function isPrivateProofUrl(url: string): boolean {
  const ref = parseSupabaseStorageUrl(url);
  return ref != null && ref.bucket === 'payment-proofs' && ref.kind === 'sign';
}

export function assertUploadedImageUrl(
  url: string | null | undefined,
  label = 'Ảnh',
): string | null {
  if (url == null) return null;
  if (!url.trim()) {
    throw new AppError(400, `${label} không hợp lệ`, 'INVALID_IMAGE_URL');
  }
  if (!isUploadedImageUrl(url)) {
    throw new AppError(400, `${label} không hợp lệ`, 'INVALID_IMAGE_URL');
  }
  return url.trim();
}

export function assertUploadedImageUrls(
  urls: string[] | null | undefined,
  label = 'Ảnh',
): string[] {
  if (!urls?.length) return [];
  return urls.map((u) => {
    const v = assertUploadedImageUrl(u, label);
    if (v == null) throw new AppError(400, `${label} không hợp lệ`, 'INVALID_IMAGE_URL');
    return v;
  });
}

export function assertPrivateProofUrl(
  url: string | null | undefined,
  label = 'Ảnh biên lai',
): string | null {
  if (url == null) return null;
  if (!url.trim()) {
    throw new AppError(400, `${label} không hợp lệ`, 'INVALID_IMAGE_URL');
  }
  if (!isPrivateProofUrl(url)) {
    throw new AppError(400, `${label} không hợp lệ`, 'INVALID_IMAGE_URL');
  }
  return url.trim();
}

export function assertPrivateProofUrls(
  urls: string[] | null | undefined,
  label = 'Ảnh bằng chứng',
): string[] {
  if (!urls?.length) return [];
  return urls.map((u) => {
    const v = assertPrivateProofUrl(u, label);
    if (v == null) throw new AppError(400, `${label} không hợp lệ`, 'INVALID_IMAGE_URL');
    return v;
  });
}

/** Cấp lại signed URL (24h) — dùng khi trả chi tiết đơn/khiếu nại. */
export async function resignPrivateUrl(
  supabase: SupabaseClient,
  url: string,
): Promise<string> {
  const ref = parseSupabaseStorageUrl(url);
  if (!ref || ref.bucket !== 'payment-proofs') return url;
  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, PROOF_SIGN_SECONDS);
  if (error || !data?.signedUrl) {
    console.error(`resign ${ref.bucket}/${ref.path}:`, error?.message);
    return url;
  }
  return data.signedUrl;
}

export async function resignPrivateUrls(
  supabase: SupabaseClient,
  urls: string[] | null | undefined,
): Promise<string[]> {
  if (!urls?.length) return [];
  return Promise.all(urls.map((u) => resignPrivateUrl(supabase, u)));
}

/** Xóa object storage theo URL đã lưu (Supabase + R2, best-effort). */
export async function removeStorageObjects(
  supabase: SupabaseClient,
  urls: string[],
): Promise<number> {
  const byBucket = new Map<string, string[]>();
  const r2Keys: string[] = [];
  for (const url of urls) {
    const ref = parseSupabaseStorageUrl(url);
    if (ref) {
      const list = byBucket.get(ref.bucket) ?? [];
      list.push(ref.path);
      byBucket.set(ref.bucket, list);
      continue;
    }
    const r2Key = parseR2PublicKey(url);
    if (r2Key) r2Keys.push(r2Key);
  }
  let removed = 0;
  for (const [bucket, paths] of byBucket) {
    const unique = [...new Set(paths)];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      const { error } = await supabase.storage.from(bucket).remove(chunk);
      if (error) {
        console.error(`storage remove ${bucket}:`, error.message);
      } else {
        removed += chunk.length;
      }
    }
  }
  for (const key of [...new Set(r2Keys)]) {
    await deleteR2Object(key);
    removed += 1;
  }
  return removed;
}

/**
 * Khi CMS thay ảnh: xóa URL cũ không còn trong danh sách mới (public R2/Supabase).
 * Không xóa private payment-proofs.
 */
export async function removeReplacedPublicImages(
  supabase: SupabaseClient,
  previous: (string | null | undefined)[],
  next: (string | null | undefined)[],
): Promise<void> {
  const nextSet = new Set(next.map((u) => u?.trim()).filter(Boolean) as string[]);
  const stale = previous
    .map((u) => u?.trim())
    .filter((u): u is string => typeof u === 'string' && u.length > 0 && !nextSet.has(u));
  if (!stale.length) return;
  // Chỉ xóa URL thuộc storage dự án (public)
  const safe = stale.filter((u) => isUploadedImageUrl(u) && !isPrivateProofUrl(u));
  if (!safe.length) return;
  await removeStorageObjects(supabase, safe);
}
