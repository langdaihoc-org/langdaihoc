import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sellerApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { postStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/ui/brand';
import { MultiImageUploader, uploadSellerImage } from '@/components/ui/image-uploader';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { useSellerShop } from './seller-shared';

export function SellerPostsPage() {
  const qc = useQueryClient();
  const { data: shopData } = useSellerShop();
  const shop = shopData?.data;
  const approved = shop?.status === 'approved';
  const { data, isLoading } = useQuery({ queryKey: ['seller-posts'], queryFn: () => sellerApi.posts() });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () =>
      sellerApi.addPost({
        title,
        body: body || undefined,
        imageUrls: imageUrls.length ? imageUrls : undefined,
        imageUrl: imageUrls[0],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-posts'] });
      setTitle('');
      setBody('');
      setImageUrls([]);
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => sellerApi.updatePost(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-posts'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => sellerApi.deletePost(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-posts'] });
      setDeletePostId(null);
    },
  });

  const { toast } = useToast();
  const shareLink = (id: string) => {
    const url = `${window.location.origin}/p/${id}`;
    void navigator.clipboard.writeText(url);
    toast('Đã copy link bài đăng', 'success');
  };

  return (
    <div className="space-y-3">
      <h1 className="font-bold">Bài đăng feed</h1>
      <p className="text-sm text-[var(--color-muted)]">
        Chỉ cần tiêu đề, nội dung và ảnh. Nút <strong>Đặt Ngay</strong> luôn dẫn khách vào quán.
      </p>
      <Card className="max-w-lg space-y-3">
        {!approved && <p className="text-sm text-amber-700">Cửa hàng cần được duyệt trước khi đăng bài.</p>}
        <Input
          label="Tiêu đề"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!approved}
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Nội dung</label>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm disabled:opacity-60"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hôm nay giảm 10k trà sữa size M…"
            disabled={!approved}
          />
        </div>
        <MultiImageUploader
          label="Ảnh"
          value={imageUrls}
          onChange={setImageUrls}
          disabled={!approved}
          onUpload={(file) => uploadSellerImage(sellerApi.uploadImage, file, 'post-images')}
        />
        <Button
          onClick={() => add.mutate()}
          loading={add.isPending}
          disabled={!approved || !title.trim()}
        >
          Đăng bài
        </Button>
      </Card>

      {isLoading ? (
        <Card className="py-8 text-center text-sm text-[var(--color-muted)]">Đang tải...</Card>
      ) : (data?.data ?? []).length === 0 ? (
        <Card className="py-8 text-center text-sm text-[var(--color-muted)]">Chưa có bài đăng</Card>
      ) : (
        (data?.data ?? []).map((p) => {
          const thumb = p.imageUrls?.[0] || p.imageUrl;
          return (
            <Card key={p.id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 gap-3">
                  {thumb && (
                    <img
                      src={thumb}
                      alt=""
                      className="size-14 shrink-0 rounded-xl object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold">{p.title}</p>
                    {p.body && <p className="mt-1 line-clamp-2 text-sm">{p.body}</p>}
                    <div className="mt-1">
                      <StatusBadge variant={p.status === 'published' ? 'green' : 'gray'}>{postStatusLabel(p.status)}</StatusBadge>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => shareLink(p.id)}>Copy link</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      update.mutate({
                        id: p.id,
                        body: { status: p.status === 'published' ? 'hidden' : 'published' },
                      })
                    }
                  >
                    {p.status === 'published' ? 'Ẩn' : 'Hiện'}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeletePostId(p.id)}>Xóa</Button>
                </div>
              </div>
            </Card>
          );
        })
      )}

      <ConfirmDialog
        open={Boolean(deletePostId)}
        title="Xóa bài đăng này?"
        description="Không hoàn tác được. Bạn có thể đăng lại sau."
        confirmLabel="Xóa"
        cancelLabel="Giữ lại"
        variant="danger"
        loading={remove.isPending}
        onCancel={() => setDeletePostId(null)}
        onConfirm={() => deletePostId && remove.mutate(deletePostId)}
      />
    </div>
  );
}
