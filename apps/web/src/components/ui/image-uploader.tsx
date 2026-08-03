import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;

function assertAllowedImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return 'Chỉ chấp nhận JPEG, PNG, WEBP hoặc GIF';
  }
  if (file.size > 5 * 1024 * 1024) {
    return 'Ảnh tối đa 5MB';
  }
  return null;
}

/** Nén/resize phía client trước khi upload (giảm payload, giữ GIF nguyên). */
async function optimizeImageForUpload(file: File): Promise<File> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outType, outType === 'image/jpeg' ? JPEG_QUALITY : undefined);
    });
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    const ext = outType === 'image/png' ? 'png' : 'jpg';
    return new File([blob], `${base}.${ext}`, { type: outType, lastModified: Date.now() });
  } catch {
    return file;
  }
}

export function ImageUploader({
  label = 'Ảnh món',
  value,
  onChange,
  onUpload,
  onUploadingChange,
  disabled,
}: {
  label?: string;
  value?: string | null;
  onChange: (url: string | null) => void;
  onUpload: (file: File) => Promise<string>;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onUploadingChange?.(loading);
  }, [loading, onUploadingChange]);

  const handleFile = async (file: File) => {
    const invalid = assertAllowedImage(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const optimized = await optimizeImageForUpload(file);
      const url = await onUpload(optimized);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-start gap-3">
        <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-line)] bg-orange-50">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="size-6 text-[var(--color-muted)]" />
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 className="size-5 animate-spin text-brand-orange" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={disabled || loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || loading}
            onClick={() => inputRef.current?.click()}
          >
            {value ? 'Đổi ảnh' : 'Tải ảnh lên'}
          </Button>
          {value && (
            <button
              type="button"
              className="text-left text-xs text-red-500 hover:underline"
              onClick={() => onChange(null)}
              disabled={disabled || loading}
            >
              Xóa ảnh
            </button>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}

/** Nhiều ảnh — chỉ tải file lên, không nhập URL */
export function MultiImageUploader({
  label = 'Ảnh',
  value,
  onChange,
  onUpload,
  onUploadingChange,
  disabled,
  max = 10,
}: {
  label?: string;
  value: string[];
  onChange: (urls: string[]) => void;
  onUpload: (file: File) => Promise<string>;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onUploadingChange?.(loading);
  }, [loading, onUploadingChange]);

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const remaining = max - value.length;
    if (remaining <= 0) {
      setError(`Tối đa ${max} ảnh`);
      return;
    }
    const picked = list.slice(0, remaining);
    for (const file of picked) {
      const invalid = assertAllowedImage(file);
      if (invalid) {
        setError(invalid);
        return;
      }
    }
    setError(null);
    setLoading(true);
    try {
      const uploaded: string[] = [];
      for (const file of picked) {
        const optimized = await optimizeImageForUpload(file);
        uploaded.push(await onUpload(optimized));
      }
      onChange([...value, ...uploaded].slice(0, max));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {label}{' '}
        <span className="font-normal text-[var(--color-muted)]">
          ({value.length}/{max})
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {value.map((url) => (
          <div
            key={url}
            className="relative size-20 overflow-hidden rounded-xl border border-[var(--color-line)] bg-orange-50"
          >
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
              onClick={() => onChange(value.filter((u) => u !== url))}
              disabled={disabled || loading}
              aria-label="Xóa ảnh"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            disabled={disabled || loading}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex size-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-line)] bg-white text-[var(--color-muted)] transition-colors hover:border-brand-orange hover:text-brand-orange',
              (disabled || loading) && 'opacity-60',
            )}
          >
            {loading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            <span className="text-[10px] font-medium">Tải lên</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        disabled={disabled || loading}
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function uploadSellerImage(
  uploadFn: (body: {
    bucket: 'food-images' | 'laundry-images' | 'post-images';
    contentType: string;
    dataBase64: string;
    fileName?: string;
  }) => Promise<{ data: { url: string } }>,
  file: File,
  bucket: 'food-images' | 'laundry-images' | 'post-images',
) {
  const dataBase64 = await fileToBase64(file);
  const res = await uploadFn({
    bucket,
    contentType: file.type,
    dataBase64,
    fileName: file.name,
  });
  return res.data.url;
}

export async function uploadAdminImage(
  uploadFn: (body: {
    bucket: 'post-images' | 'banner-images';
    contentType: string;
    dataBase64: string;
    fileName?: string;
  }) => Promise<{ data: { url: string } }>,
  file: File,
  bucket: 'post-images' | 'banner-images',
) {
  const dataBase64 = await fileToBase64(file);
  const res = await uploadFn({
    bucket,
    contentType: file.type,
    dataBase64,
    fileName: file.name,
  });
  return res.data.url;
}

export async function uploadBuyerImage(
  uploadFn: (body: {
    bucket: 'payment-proofs';
    contentType: string;
    dataBase64: string;
    fileName?: string;
    orderId: string;
  }) => Promise<{ data: { url: string } }>,
  file: File,
  orderId: string,
) {
  const dataBase64 = await fileToBase64(file);
  const res = await uploadFn({
    bucket: 'payment-proofs',
    contentType: file.type,
    dataBase64,
    fileName: file.name,
    orderId,
  });
  return res.data.url;
}
