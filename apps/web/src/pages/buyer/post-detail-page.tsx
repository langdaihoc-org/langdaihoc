import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { catalogApi } from '@/lib/api';
import { FeedPostCard } from '@/components/marketplace/feed-post';
import { Card } from '@/components/ui/card';
import { FoodCardSkeleton } from '@/components/ui/skeleton';

export function PostDetailPage() {
  const { postId } = useParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['post', postId],
    queryFn: () => catalogApi.post(postId!),
    enabled: !!postId,
  });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link to="/explore" className="inline-flex items-center gap-1 text-sm font-medium text-brand-orange">
        <ArrowLeft className="size-4" /> Về Khám phá
      </Link>
      {isLoading && <FoodCardSkeleton />}
      {isError && (
        <Card className="p-6 text-center text-sm text-[var(--color-muted)]">
          Không tìm thấy bài đăng hoặc đã bị ẩn.
        </Card>
      )}
      {data?.data && <FeedPostCard post={data.data} />}
    </div>
  );
}
