import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type AdminPost } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { postStatusLabel } from '@/lib/format';
import { useState } from 'react';
import { MultiImageUploader, uploadAdminImage } from '@/components/ui/image-uploader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function AdminPostsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const { data } = useQuery({
    queryKey: ['admin-posts', statusFilter],
    queryFn: () => adminApi.posts(statusFilter || undefined),
  });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState('/food');
  const [isPinned, setIsPinned] = useState(false);
  const [deletePost, setDeletePost] = useState<{ id: string; title: string } | null>(null);

  const add = useMutation({
    mutationFn: () =>
      adminApi.addPost({
        title,
        body: body || undefined,
        imageUrls: imageUrls.length ? imageUrls : undefined,
        imageUrl: imageUrls[0],
        linkUrl: linkUrl || '/food',
        ctaLabel: 'Đặt Ngay',
        isPinned,
        status: 'published',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-posts'] });
      setTitle('');
      setBody('');
      setImageUrls([]);
      setLinkUrl('/food');
      setIsPinned(false);
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => adminApi.updatePost(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-posts'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deletePost(id),
    onSuccess: () => {
      setDeletePost(null);
      qc.invalidateQueries({ queryKey: ['admin-posts'] });
    },
  });

  return (
    <div className="space-y-3">
      <h1 className="font-bold">Bài đăng / Feed</h1>
      <Card className="max-w-lg space-y-3">
        <p className="text-sm font-medium text-[var(--color-muted)]">
          Đăng bài hệ thống — tiêu đề, nội dung, tải ảnh. Nút luôn là <strong>Đặt Ngay</strong>.
        </p>
        <Input label="Tiêu đề" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Nội dung</label>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nội dung ngắn gọn cho bài đăng…"
          />
        </div>
        <MultiImageUploader
          label="Ảnh"
          value={imageUrls}
          onChange={setImageUrls}
          onUpload={(file) => uploadAdminImage(adminApi.uploadImage, file, 'post-images')}
        />
        <Input label="Link đích (trang mở khi bấm Đặt Ngay)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
          Ghim đầu feed
        </label>
        <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!title.trim()}>Đăng bài</Button>
      </Card>

      <Card className="flex flex-wrap gap-3">
        <div className="min-w-[160px] space-y-1.5">
          <label className="block text-sm font-medium">Lọc trạng thái</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-2xl border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm"
          >
            <option value="">Tất cả</option>
            <option value="published">Đang hiện</option>
            <option value="hidden">Đã ẩn</option>
          </select>
        </div>
      </Card>

      {(data?.data ?? []).map((p: AdminPost) => {
        const thumb = p.imageUrls?.[0] || p.imageUrl;
        return (
          <Card key={p.id} className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 gap-3">
                {thumb && <img src={thumb} alt="" className="size-14 shrink-0 rounded-xl object-cover" />}
                <div className="min-w-0">
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {p.shopName || 'langdaihoc'} · {new Date(p.createdAt).toLocaleString('vi-VN')}
                  </p>
                  {p.body && <p className="mt-1 line-clamp-2 text-sm">{p.body}</p>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <StatusBadge variant={p.status === 'published' ? 'green' : p.status === 'hidden' ? 'gray' : 'orange'}>
                      {postStatusLabel(p.status)}
                    </StatusBadge>
                    {p.isPinned && <StatusBadge variant="orange">Ghim</StatusBadge>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => update.mutate({ id: p.id, body: { isPinned: !p.isPinned } })}
                >
                  {p.isPinned ? 'Bỏ ghim' : 'Ghim'}
                </Button>
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
                <Button size="sm" variant="danger" onClick={() => setDeletePost({ id: p.id, title: p.title })}>Xóa</Button>
              </div>
            </div>
            <a href={"/p/" + p.id} className="text-xs font-medium text-brand-orange" target="_blank" rel="noreferrer">
              /p/{p.id}
            </a>
          </Card>
        );
      })}
      <ConfirmDialog
        open={!!deletePost}
        title={`Xóa bài "${deletePost?.title}"?`}
        description="Bài đăng sẽ biến mất khỏi feed. Không hoàn tác được."
        confirmLabel="Xóa"
        cancelLabel="Giữ lại"
        variant="danger"
        loading={remove.isPending}
        onCancel={() => setDeletePost(null)}
        onConfirm={() => deletePost && remove.mutate(deletePost.id)}
      />
    </div>
  );
}
