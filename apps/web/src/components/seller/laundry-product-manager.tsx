import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Search, WashingMachine } from 'lucide-react';
import { sellerApi, ApiError, type SellerLaundryItem } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { ImageUploader, uploadSellerImage } from '@/components/ui/image-uploader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { formatPrice } from '@/lib/format';

const UNIT_LABELS: Record<string, string> = { kg: 'kg', item: 'món', load: 'tải' };

export function LaundryProductManager({ approved }: { approved: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['seller-laundry'], queryFn: () => sellerApi.laundryServices() });

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState<'kg' | 'item' | 'load'>('kg');
  const [basePrice, setBasePrice] = useState('');
  const [estimatedTimeHours, setEstimatedTimeHours] = useState('24');
  const [serviceAreasText, setServiceAreasText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const items = data?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setUnit('kg');
    setBasePrice('');
    setEstimatedTimeHours('24');
    setServiceAreasText('');
    setImageUrl(null);
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (item: SellerLaundryItem) => {
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description ?? '');
    setUnit((item.unit as 'kg' | 'item' | 'load') || 'kg');
    setBasePrice(String(item.basePrice));
    setEstimatedTimeHours(String(item.estimatedTimeHours ?? 24));
    setServiceAreasText((item.serviceAreas ?? []).join(', '));
    setImageUrl(item.imageUrl ?? null);
    setFormError(null);
    setShowForm(true);
  };

  const parseAreas = (text: string) =>
    text.split(/[,;]/).map((s) => s.trim()).filter(Boolean);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        unit,
        basePrice: Number(basePrice),
        estimatedTimeHours: Number(estimatedTimeHours) || 24,
        serviceAreas: parseAreas(serviceAreasText),
        imageUrl,
      };
      if (editingId) return sellerApi.updateLaundry(editingId, payload);
      return sellerApi.addLaundry(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-laundry'] });
      toast(editingId ? 'Đã lưu thay đổi dịch vụ' : 'Đã thêm dịch vụ giặt', 'success');
      setShowForm(false);
      resetForm();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Không thể lưu dịch vụ';
      setFormError(msg);
      toast(msg, 'error');
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      sellerApi.updateLaundry(id, { isAvailable }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-laundry'] }),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không cập nhật được dịch vụ', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => sellerApi.deleteLaundry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-laundry'] });
      toast('Đã xóa dịch vụ', 'info');
      setDeleteId(null);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không xóa được dịch vụ', 'error'),
  });

  const deleteTarget = items.find((i) => i.id === deleteId);

  return (
    <div className="space-y-3 pb-16 lg:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-bold">Sản phẩm · Giặt đồ</h1>
        <Button size="sm" variant="green" className="hidden lg:inline-flex" disabled={!approved} onClick={() => (showForm && !editingId ? setShowForm(false) : openCreate())}>
          {showForm ? 'Đóng' : '+ Thêm dịch vụ'}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
        <Input placeholder="Tìm dịch vụ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {formError && <p className="text-sm text-red-500">{formError}</p>}

      {showForm && approved && (
        <Card className="space-y-3">
          <p className="font-semibold">{editingId ? 'Sửa dịch vụ' : 'Thêm dịch vụ mới'}</p>
          <Input label="Tên dịch vụ *" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Đơn vị tính</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'kg' | 'item' | 'load')}
                className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm"
              >
                <option value="kg">Theo kg</option>
                <option value="item">Theo món</option>
                <option value="load">Theo tải</option>
              </select>
            </div>
            <Input label={`Giá/${UNIT_LABELS[unit] ?? unit} (₫) *`} type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
          </div>
          <Input label="Thời gian xử lý (giờ)" type="number" value={estimatedTimeHours} onChange={(e) => setEstimatedTimeHours(e.target.value)} />
          <Input
            label="Khu vực phục vụ"
            placeholder="KTX A, KTX B, Làng SV..."
            value={serviceAreasText}
            onChange={(e) => setServiceAreasText(e.target.value)}
          />
          <p className="-mt-2 text-xs text-[var(--color-muted)]">Phân cách bằng dấu phẩy</p>
          <ImageUploader
            label="Ảnh dịch vụ"
            value={imageUrl}
            onChange={setImageUrl}
            onUploadingChange={setImageUploading}
            onUpload={(file) => uploadSellerImage(sellerApi.uploadImage, file, 'laundry-images')}
          />
          <div className="flex gap-2">
            <Button
              onClick={() => saveMut.mutate()}
              loading={saveMut.isPending || imageUploading}
              disabled={name.trim().length < 2 || !basePrice || Number(basePrice) <= 0 || imageUploading}
            >
              {editingId ? 'Lưu thay đổi' : 'Thêm dịch vụ'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Huỷ</Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">Đang tải...</p>
      ) : filtered.length === 0 ? (
        <Card className="py-12 text-center">
          <WashingMachine className="mx-auto size-10 text-[var(--color-muted)]" />
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {search ? 'Không tìm thấy dịch vụ' : 'Chưa có dịch vụ nào'}
          </p>
          {approved && !search && (
            <Button size="sm" variant="green" className="mt-3" onClick={openCreate}>+ Thêm dịch vụ đầu tiên</Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => (
            <Card key={item.id} className="flex flex-col gap-3">
              <div className="flex gap-3">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-green-50 text-brand-green">
                    <WashingMachine className="size-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.name}</p>
                  <p className="font-semibold text-brand-green">
                    {formatPrice(item.basePrice)}/{UNIT_LABELS[item.unit] ?? item.unit}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">~{item.estimatedTimeHours}h</p>
                  <StatusBadge variant={item.isAvailable ? 'green' : 'gray'}>{item.isAvailable ? 'Đang nhận' : 'Tạm ẩn'}</StatusBadge>
                </div>
              </div>
              {item.description && <p className="line-clamp-2 text-xs text-[var(--color-muted)]">{item.description}</p>}
              {item.serviceAreas && item.serviceAreas.length > 0 && (
                <p className="text-xs text-[var(--color-muted)]">Khu vực: {item.serviceAreas.join(', ')}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!approved} onClick={() => toggleMut.mutate({ id: item.id, isAvailable: !item.isAvailable })}>
                  {item.isAvailable ? 'Ẩn' : 'Bật'}
                </Button>
                <Button size="sm" variant="outline" disabled={!approved} onClick={() => openEdit(item)}>
                  <Pencil className="size-3.5" /> Sửa
                </Button>
                <Button size="sm" variant="danger" disabled={!approved} onClick={() => setDeleteId(item.id)}>
                  <Trash2 className="size-3.5" /> Xóa
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {approved && (
        <Button
          variant="green"
          className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 shadow-lg lg:hidden"
          onClick={() => (showForm && !editingId ? setShowForm(false) : openCreate())}
        >
          {showForm ? 'Đóng' : '+ Thêm dịch vụ'}
        </Button>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Xóa dịch vụ?"
        description={deleteTarget ? `Xóa "${deleteTarget.name}"? Khách sẽ không đặt được dịch vụ này nữa.` : undefined}
        confirmLabel="Xóa"
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
