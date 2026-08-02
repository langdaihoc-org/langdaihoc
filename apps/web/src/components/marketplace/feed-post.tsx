import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bike, ChevronLeft, ChevronRight, Pin, Share2, Store, WashingMachine, X } from 'lucide-react';
import type { FeedPost } from '@/lib/api';
import { StoreAvatar } from '@/components/marketplace/food-image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SafeNavLink } from '@/components/ui/safe-nav-link';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { sanitizeLinkUrl, sanitizeImageUrl } from '@langdaihoc/shared';

function timeAgo(iso?: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

function postImages(post: FeedPost): string[] {
  const urls = [...(post.imageUrls ?? [])]
    .map((u) => sanitizeImageUrl(u))
    .filter((u): u is string => Boolean(u));
  const primary = sanitizeImageUrl(post.imageUrl);
  if (primary && !urls.includes(primary)) {
    urls.unshift(primary);
  }
  return urls.slice(0, 10);
}

function postHref(post: FeedPost): string {
  if (post.linkUrl) return sanitizeLinkUrl(post.linkUrl, '/food');
  if (post.serviceTypes === 'ship_proxy' && post.sellerId) return `/ship/book/${post.sellerId}`;
  if (post.serviceTypes === 'laundry') return '/laundry';
  if (post.sellerId) return `/store/${post.sellerId}`;
  return '/food';
}

function postCta(post: FeedPost): { label: string; Icon: typeof Store } {
  if (post.serviceTypes === 'ship_proxy') {
    return { label: post.ctaLabel || 'Nhận ship hộ', Icon: Bike };
  }
  if (post.serviceTypes === 'laundry') {
    return { label: post.ctaLabel || 'Xem dịch vụ', Icon: WashingMachine };
  }
  return { label: 'Đặt ngay', Icon: Store };
}

/** Caption dài/ngắn do quán tự viết — mặc định thu gọn, bấm Xem thêm */
function PostCaption({ title, body }: { title: string; body?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const text = body?.trim() || '';
  const long = text.length > 180 || text.split('\n').length > 4;

  return (
    <div className="space-y-1.5 px-4 py-3">
      <h3 className="text-base font-bold leading-snug">{title}</h3>
      {text && (
        <>
          <p
            className={cn(
              'whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]/90',
              !expanded && long && 'line-clamp-4',
            )}
          >
            {text}
          </p>
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-sm font-medium text-[var(--color-muted)] hover:text-brand-orange"
            >
              {expanded ? 'Thu gọn' : 'Xem thêm'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Xem ảnh toàn màn — vuốt / mũi tên để lướt */
function GalleryLightbox({
  images,
  index,
  alt,
  onClose,
  onIndexChange,
}: {
  images: string[];
  index: number;
  alt: string;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const touchX = useRef<number | null>(null);
  const total = images.length;
  const safeIndex = ((index % total) + total) % total;
  const src = images[safeIndex];

  const go = (delta: number) => {
    if (total <= 1) return;
    onIndexChange((safeIndex + delta + total) % total);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go depends on safeIndex; key handler refreshed via effect deps
  }, [safeIndex, total, onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/92">
      <div className="flex items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <p className="text-sm font-medium tabular-nums">
          {safeIndex + 1} / {total}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex size-10 items-center justify-center rounded-full bg-white/10"
          aria-label="Đóng"
        >
          <X className="size-5" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center touch-pan-y"
        onTouchStart={(e) => {
          touchX.current = e.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          touchX.current = null;
          if (start == null || end == null) return;
          const dx = end - start;
          if (Math.abs(dx) < 40) return;
          go(dx < 0 ? 1 : -1);
        }}
      >
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-2 z-10 hidden size-10 items-center justify-center rounded-full bg-white/15 text-white sm:flex"
              aria-label="Ảnh trước"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-2 z-10 hidden size-10 items-center justify-center rounded-full bg-white/15 text-white sm:flex"
              aria-label="Ảnh sau"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />
      </div>

      {total > 1 && (
        <div className="flex justify-center gap-1.5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ảnh ${i + 1}`}
              onClick={() => onIndexChange(i)}
              className="flex size-11 items-center justify-center"
            >
              <span
                className={cn(
                  'size-2.5 rounded-full transition-colors',
                  i === safeIndex ? 'bg-white' : 'bg-white/35',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Collage nhiều ảnh kiểu Facebook group — bấm ảnh để lướt xem */
function PostImageCollage({ images, alt }: { images: string[]; alt: string }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (images.length === 0) return null;

  const cell = (src: string, imageIndex: number, className?: string, extra?: number) => (
    <button
      key={`${imageIndex}-${src}`}
      type="button"
      onClick={() => setViewerIndex(imageIndex)}
      className={cn('relative block overflow-hidden bg-[#6b4f3a]', className)}
    >
      <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      {extra != null && extra > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 text-2xl font-bold text-white">
          +{extra}
        </div>
      )}
    </button>
  );

  let grid: ReactNode;
  if (images.length === 1) {
    grid = <div className="aspect-[4/3] w-full">{cell(images[0]!, 0, 'h-full w-full')}</div>;
  } else if (images.length === 2) {
    grid = (
      <div className="grid aspect-[2/1] grid-cols-2 gap-0.5 bg-[#6b4f3a]">
        {cell(images[0]!, 0, 'h-full')}
        {cell(images[1]!, 1, 'h-full')}
      </div>
    );
  } else if (images.length === 3) {
    grid = (
      <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5 bg-[#6b4f3a]">
        {cell(images[0]!, 0, 'row-span-2 h-full')}
        {cell(images[1]!, 1, 'h-full')}
        {cell(images[2]!, 2, 'h-full')}
      </div>
    );
  } else if (images.length === 4) {
    grid = (
      <div className="grid aspect-square grid-cols-2 grid-rows-2 gap-0.5 bg-[#6b4f3a]">
        {images.slice(0, 4).map((src, i) => cell(src, i, 'h-full min-h-0'))}
      </div>
    );
  } else {
    const extra = images.length - 5;
    grid = (
      <div className="grid aspect-[4/3] grid-cols-3 grid-rows-3 gap-0.5 bg-[#6b4f3a]">
        {cell(images[0]!, 0, 'col-span-2 row-span-2 h-full min-h-0')}
        {cell(images[2]!, 2, 'h-full min-h-0')}
        {cell(images[3]!, 3, 'h-full min-h-0')}
        {cell(images[1]!, 1, 'col-span-2 h-full min-h-0')}
        {cell(images[4]!, 4, 'h-full min-h-0', extra > 0 ? extra : undefined)}
      </div>
    );
  }

  return (
    <>
      <div className="block">{grid}</div>
      {viewerIndex != null && (
        <GalleryLightbox
          images={images}
          index={viewerIndex}
          alt={alt}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
        />
      )}
    </>
  );
}

export function FeedPostCard({ post }: { post: FeedPost }) {
  const { toast } = useToast();
  const shop = post.shopName || 'langdaihoc';
  const storeHref =
    post.serviceTypes === 'ship_proxy' && post.sellerId
      ? `/ship/book/${post.sellerId}`
      : post.sellerId
        ? `/store/${post.sellerId}`
        : '/food';
  const buyHref = postHref(post);
  const images = postImages(post);
  const { label: ctaLabel, Icon: CtaIcon } = postCta(post);

  const share = async () => {
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, text: post.body ?? post.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast('Đã copy link bài đăng', 'success');
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast('Đã copy link bài đăng', 'success');
      } catch {
        toast('Không thể chia sẻ', 'error');
      }
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-3 px-4 pt-4">
        <Link to={storeHref}>
          <StoreAvatar name={shop} src={post.avatarUrl} className="size-11 rounded-full" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={storeHref} className="font-semibold hover:underline">
            {shop}
          </Link>
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            {timeAgo(post.publishedAt ?? post.createdAt)}
            {post.isPinned && (
              <span className="inline-flex items-center gap-0.5 text-brand-orange">
                <Pin className="size-3" /> Ghim
              </span>
            )}
          </p>
        </div>
      </div>

      <PostCaption title={post.title} body={post.body} />

      <PostImageCollage images={images} alt={post.title} />

      <div className="flex items-center gap-2 border-t border-[var(--color-line)] px-4 py-3">
        <SafeNavLink to={buyHref} className="flex-1">
          <Button className="w-full">
            <CtaIcon className="size-4" />
            {ctaLabel}
          </Button>
        </SafeNavLink>
        <Button type="button" variant="outline" size="icon" onClick={share} aria-label="Chia sẻ">
          <Share2 className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

export function HomeFeed({ posts }: { posts: FeedPost[] }) {
  if (posts.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Tin hôm nay</h2>
        <Link to="/explore" className="text-sm font-medium text-brand-orange">
          Xem tất cả
        </Link>
      </div>
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        {posts.slice(0, 3).map((p) => (
          <FeedPostCard key={p.id} post={p} />
        ))}
      </div>
    </section>
  );
}
