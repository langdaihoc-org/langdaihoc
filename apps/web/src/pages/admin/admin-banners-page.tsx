import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type Banner } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { useState } from 'react';
import { ImageUploader, uploadAdminImage } from '@/components/ui/image-uploader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function AdminBannersPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-banners'], queryFn: () => adminApi.banners() });
  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    imageUrl: null as string | null,
    linkUrl: '/food',
    ctaLabel: 'Xem ngay',
    isPopup: false,
    sortOrder: '0',
  });
  const add = useMutation({
    mutationFn: () =>
      adminApi.addBanner({
        title: form.title,
        subtitle: form.subtitle || undefined,
        imageUrl: form.imageUrl || undefined,
        linkUrl: form.linkUrl || undefined,
        ctaLabel: form.ctaLabel || undefined,
        isPopup: form.isPopup,
        isActive: true,
        sortOrder: Number(form.sortOrder) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-banners'] });
      setForm({ title: '', subtitle: '', imageUrl: null, linkUrl: '/food', ctaLabel: 'Xem ngay', isPopup: false, sortOrder: '0' });
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminApi.updateBanner(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-banners'] }),
  });
  const togglePopup = useMutation({
    mutationFn: ({ id, isPopup }: { id: string; isPopup: boolean }) => adminApi.updateBanner(id, { isPopup }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-banners'] }),
  });
  const [deleteBanner, setDeleteBanner] = useState<{ id: string; title: string } | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteBanner(id),
    onSuccess: () => {
      setDeleteBanner(null);
      qc.invalidateQueries({ queryKey: ['admin-banners'] });
    },
  });

  return (
    <div className="space-y-3">
      <h1 className="font-bold">Quản lý banner & popup</h1>
      <Card className="max-w-lg space-y-3">
        <Input label="Tiêu đề" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input label="Phụ đề" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
        <ImageUploader
          label="Ảnh banner"
          value={form.imageUrl}
          onChange={(url) => setForm({ ...form, imageUrl: url })}
          onUpload={(file) => uploadAdminImage(adminApi.uploadImage, file, 'banner-images')}
        />
        <Input label="Link đích" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/food" />
        <Input label="Nhãn nút CTA" value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} />
        <Input label="Thứ tự" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isPopup} onChange={(e) => setForm({ ...form, isPopup: e.target.checked })} />
          Hiện dạng popup quảng cáo (kiểu Shopee)
        </label>
        <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!form.title.trim()}>Thêm banner</Button>
      </Card>
      {(data?.data ?? []).map((b: Banner) => (
        <Card key={b.id} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {b.imageUrl && (
              <img src={b.imageUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">{b.title}</p>
              {b.subtitle && <p className="text-sm text-[var(--color-muted)]">{b.subtitle}</p>}
              <p className="text-xs text-[var(--color-muted)]">{b.linkUrl ?? '—'} · {b.ctaLabel || 'Xem ngay'}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <StatusBadge variant={b.isActive !== false ? 'green' : 'gray'}>{b.isActive !== false ? 'Hiển thị' : 'Ẩn'}</StatusBadge>
                <StatusBadge variant={b.isPopup ? 'orange' : 'gray'}>{b.isPopup ? 'Popup' : 'Banner ngang'}</StatusBadge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => togglePopup.mutate({ id: b.id, isPopup: !b.isPopup })}>
              {b.isPopup ? '→ Ngang' : '→ Popup'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => toggle.mutate({ id: b.id, isActive: b.isActive === false })}>
              {b.isActive !== false ? 'Ẩn' : 'Hiện'}
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDeleteBanner({ id: b.id, title: b.title })}>Xóa</Button>
          </div>
        </Card>
      ))}
      <ConfirmDialog
        open={!!deleteBanner}
        title={`Xóa banner "${deleteBanner?.title}"?`}
        description="Banner sẽ bị xóa khỏi trang chủ. Không hoàn tác được."
        confirmLabel="Xóa"
        cancelLabel="Giữ lại"
        variant="danger"
        loading={remove.isPending}
        onCancel={() => setDeleteBanner(null)}
        onConfirm={() => deleteBanner && remove.mutate(deleteBanner.id)}
      />
    </div>
  );
}
