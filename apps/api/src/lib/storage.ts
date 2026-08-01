import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../middleware/error-handler.js';
import { getSupabaseUrl } from './env.js';

export const PUBLIC_BUCKETS = [
  'food-images',
  'laundry-images',
  'post-images',
  'banner-images',
] as const;

/** Chứng từ CK — private (signed URL), không public bucket. */
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
const PROOF_SIGN_SECONDS = 60 * 60 * 24 * 30; // 30 ngày

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

function sniffImageContentType(buffer: Buffer): AllowedImageContentType | null {
  if (buffer.length < 12) return null;
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
  // WEBP (RIFF....WEBP)
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
  const wantPublic = !isPrivateBucket(bucket);
  const { data: buckets } = await supabase.storage.listBuckets();
  const existing = buckets?.find((b) => b.name === bucket);
  if (existing) {
    if (Boolean(existing.public) !== wantPublic) {
      const { error } = await supabase.storage.updateBucket(bucket, { public: wantPublic });
      if (error) {
        console.error(`updateBucket ${bucket}:`, error.message);
      }
    }
    return;
  }
  const { error } = await supabase.storage.createBucket(bucket, { public: wantPublic });
  if (error && !error.message.includes('already exists')) {
    console.error(`createBucket ${bucket}:`, error.message);
    throw new AppError(500, 'Không tạo được kho ảnh', 'STORAGE_ERROR');
  }
}

export async function uploadImage(
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

/**
 * Chỉ chấp nhận URL ảnh đã upload lên Supabase Storage của dự án này
 * (khớp origin SUPABASE_URL + bucket allowlist — không tin host giả).
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
  if (!supabaseOrigins().includes(parsed.origin)) return false;
  const path = parsed.pathname;
  const publicIdx = path.indexOf(STORAGE_PUBLIC_MARKER);
  const signIdx = path.indexOf(STORAGE_SIGN_MARKER);
  let after = '';
  if (publicIdx >= 0) {
    after = path.slice(publicIdx + STORAGE_PUBLIC_MARKER.length);
  } else if (signIdx >= 0) {
    after = path.slice(signIdx + STORAGE_SIGN_MARKER.length);
  } else {
    return false;
  }
  const bucket = after.split('/').filter(Boolean)[0];
  return (ALL_BUCKETS as readonly string[]).includes(bucket ?? '');
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
