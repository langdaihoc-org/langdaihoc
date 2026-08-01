/** Cloudflare R2 (S3-compatible) — ảnh public. */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export type R2Config = {
  client: S3Client;
  bucket: string;
  /** Base URL công khai, không trailing slash (r2.dev hoặc custom domain). */
  publicBaseUrl: string;
};

let cached: R2Config | null | undefined;

/** Trả null nếu chưa cấu hình đủ — fallback Supabase. */
export function getR2Config(): R2Config | null {
  if (cached !== undefined) return cached;

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    cached = null;
    return null;
  }

  cached = {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      // R2 không tương thích checksum mặc định của AWS SDK v3.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
    bucket,
    publicBaseUrl,
  };
  return cached;
}

/** Cho test / hot-reload env. */
export function resetR2ConfigCache() {
  cached = undefined;
}

export function r2PublicOrigins(): string[] {
  const cfg = getR2Config();
  if (!cfg) return [];
  try {
    return [new URL(cfg.publicBaseUrl).origin];
  } catch {
    return [];
  }
}

export async function putR2Object(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const cfg = getR2Config();
  if (!cfg) throw new Error('R2 is not configured');

  await cfg.client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  // Key đã sanitize (ASCII); không encode để khớp object key trên R2.
  return `${cfg.publicBaseUrl}/${key}`;
}
