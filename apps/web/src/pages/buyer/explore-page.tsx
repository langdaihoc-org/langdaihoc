import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { catalogApi } from '@/lib/api';
import { FeedPostCard } from '@/components/marketplace/feed-post';
import { FoodGridCard } from '@/components/marketplace/store-card';
import { FoodCardSkeleton } from '@/components/ui/skeleton';
import { Card, EmptyState } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Tab Khám phá — lướt bài quán (caption do quán tự viết), mua thì vào quán */
export function ExplorePage() {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQ = useDebounce(q.trim(), 300);
  const isSearching = debouncedQ.length > 0;

  /* Bài đăng (khi không search) */
  const postsQuery = useQuery({
    queryKey: ['posts', 'explore'],
    queryFn: () => catalogApi.posts(50),
    enabled: !isSearching,
  });

  /* Món ăn (khi search) */
  const foodQuery = useQuery({
    queryKey: ['explore-food-search', debouncedQ],
    queryFn: () => catalogApi.food(`q=${encodeURIComponent(debouncedQ)}&limit=50`),
    enabled: isSearching,
    staleTime: 30_000,
  });

  const posts = postsQuery.data?.data ?? [];
  const foodItems = foodQuery.data?.data ?? [];
  const isLoading = isSearching ? foodQuery.isLoading : postsQuery.isLoading;
  const isError = isSearching ? foodQuery.isError : postsQuery.isError;
  const isFetching = isSearching ? foodQuery.isFetching : postsQuery.isFetching;
  const refetch = isSearching ? foodQuery.refetch : postsQuery.refetch;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">Khám phá</h1>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm món ăn…"
            className="h-9 w-full rounded-xl border border-[var(--color-line)] bg-white py-1 pl-9 pr-8 text-sm outline-none transition-colors focus:border-brand-orange"
          />
          {q && (
            <button
              type="button"
              onClick={() => { setQ(''); inputRef.current?.focus(); }}
              aria-label="Xoá tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-black"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <FoodCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <Card className="space-y-3 p-6 text-center">
          <p className="text-sm text-[var(--color-muted)]">Không tải được dữ liệu.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-sm font-semibold text-brand-orange-dark"
          >
            Thử lại
          </button>
        </Card>
      ) : isSearching ? (
        foodItems.length === 0 ? (
          <EmptyState title="Không tìm thấy" description={`Không có món phù hợp với "${debouncedQ}"`} />
        ) : (
          <div className={cn('grid grid-cols-2 gap-3', isFetching && 'opacity-75')}>
            {foodItems.map((item, idx) => (
              <FoodGridCard key={item.id} item={item} index={idx} />
            ))}
          </div>
        )
      ) : posts.length === 0 ? (
        <EmptyState title="Chưa có bài đăng" description="Quán chưa đăng nội dung nào" />
      ) : (
        <div className={isFetching ? 'space-y-4 opacity-80' : 'space-y-4'}>
          {posts.map((p) => (
            <FeedPostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}
