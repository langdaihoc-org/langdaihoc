import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Search, UtensilsCrossed } from 'lucide-react';
import { sellerApi, catalogApi, ApiError, type SellerFoodItem } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { MultiImageUploader, uploadSellerImage } from '@/components/ui/image-uploader';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { formatPrice } from '@/lib/format';

type OptionRow = { name: string; priceDelta: string };
type GroupRow = {
  name: string;
  required: boolean;
  maxSelect: string;
  options: OptionRow[];
};

const UTENSILS_GROUP = 'Dụng cụ ăn';
const UTENSILS_OPTION = 'Cần dụng cụ ăn';

function emptyGroup(): GroupRow {
  return {
    name: '',
    required: false,
    maxSelect: '1',
    options: [{ name: '', priceDelta: '0' }],
  };
}

function buildOptionGroups(groups: GroupRow[], offerUtensils: boolean) {
  const result = groups
    .map((g) => {
      const opts = g.options.filter((o) => o.name.trim());
      if (!g.name.trim() || !opts.length) return null;
      const maxSelect = Math.max(1, Number(g.maxSelect) || 1);
      return {
        name: g.name.trim(),
        required: g.required,
        minSelect: g.required ? 1 : 0,
        maxSelect: Math.min(maxSelect, opts.length),
        options: opts.map((o) => ({
          name: o.name.trim(),
          priceDelta: Number(o.priceDelta) || 0,
        })),
      };
    })
    .filter(Boolean) as {
      name: string;
      required: boolean;
      minSelect: number;
      maxSelect: number;
      options: { name: string; priceDelta: number }[];
    }[];

  if (offerUtensils && !result.some((g) => g.name === UTENSILS_GROUP)) {
    result.push({
      name: UTENSILS_GROUP,
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: UTENSILS_OPTION, priceDelta: 0 }],
    });
  }
  return result;
}

function groupsFromItem(item: SellerFoodItem): { groups: GroupRow[]; offerUtensils: boolean } {
  const raw = item.optionGroups ?? [];
  const offerUtensils = raw.some((g) => g.name === UTENSILS_GROUP);
  const groups = raw
    .filter((g) => g.name !== UTENSILS_GROUP)
    .map((g) => ({
      name: g.name,
      required: g.required,
      maxSelect: String(g.maxSelect || 1),
      options: g.options.map((o) => ({
        name: o.name,
        priceDelta: String(o.priceDelta ?? 0),
      })),
    }));
  return { groups, offerUtensils };
}

function countOptions(item: SellerFoodItem) {
  return (item.optionGroups ?? []).reduce((n, g) => n + g.options.length, 0);
}

export function FoodProductManager({ approved }: { approved: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['seller-food'], queryFn: () => sellerApi.foodItems() });
  const { data: catData } = useQuery({ queryKey: ['categories', 'food'], queryFn: () => catalogApi.categories('food') });

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [prepTimeMinutes, setPrepTimeMinutes] = useState('20');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [offerUtensils, setOfferUtensils] = useState(false);

  const items = data?.data ?? [];
  const categories = catData?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPrice('');
    setDescription('');
    setPrepTimeMinutes('20');
    setCategoryIds([]);
    setImageUrls([]);
    setGroups([]);
    setOfferUtensils(false);
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (item: SellerFoodItem) => {
    setEditingId(item.id);
    setName(item.name);
    setPrice(String(item.price));
    setDescription(item.description ?? '');
    setPrepTimeMinutes(String(item.prepTimeMinutes ?? 20));
    const ids =
      item.categoryIds?.length
        ? item.categoryIds
        : item.categoryId
          ? [item.categoryId]
          : [];
    setCategoryIds(ids);
    const urls =
      item.imageUrls?.length
        ? item.imageUrls
        : item.imageUrl
          ? [item.imageUrl]
          : [];
    setImageUrls(urls);
    const parsed = groupsFromItem(item);
    setGroups(parsed.groups);
    setOfferUtensils(parsed.offerUtensils);
    setFormError(null);
    setShowForm(true);
  };

  const updateGroup = (gi: number, patch: Partial<GroupRow>) => {
    setGroups((p) => p.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  };

  const updateOption = (gi: number, oi: number, patch: Partial<OptionRow>) => {
    setGroups((p) =>
      p.map((g, i) =>
        i === gi
          ? { ...g, options: g.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) }
          : g,
      ),
    );
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        price: Number(price),
        description: description.trim() || null,
        prepTimeMinutes: Number(prepTimeMinutes) || 20,
        categoryIds,
        categoryId: categoryIds[0] ?? null,
        imageUrls,
        imageUrl: imageUrls[0] ?? null,
        optionGroups: buildOptionGroups(groups, offerUtensils),
      };
      if (editingId) return sellerApi.updateFood(editingId, payload);
      return sellerApi.addFood({
        ...payload,
        optionGroups: payload.optionGroups.length ? payload.optionGroups : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-food'] });
      toast(editingId ? 'Đã lưu thay đổi món' : 'Đã thêm món mới', 'success');
      setShowForm(false);
      resetForm();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Không thể lưu món';
      setFormError(msg);
      toast(msg, 'error');
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      sellerApi.updateFood(id, { isAvailable }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-food'] }),
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không cập nhật được món', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => sellerApi.deleteFood(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-food'] });
      toast('Đã xóa món', 'info');
      setDeleteId(null);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không xóa được món', 'error'),
  });

  const deleteTarget = items.find((i) => i.id === deleteId);

  return (
    <div className="space-y-3 pb-16 lg:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-bold">Sản phẩm · Ăn uống</h1>
        <Button size="sm" variant="green" className="hidden lg:inline-flex" disabled={!approved} onClick={() => (showForm && !editingId ? setShowForm(false) : openCreate())}>
          {showForm ? 'Đóng' : '+ Thêm món'}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
        <Input
          placeholder="Tìm món..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {formError && <p className="text-sm text-red-500">{formError}</p>}

      {showForm && approved && (
        <Card className="space-y-3">
          <p className="font-semibold">{editingId ? 'Sửa món' : 'Thêm món mới'}</p>
          <Input label="Tên món *" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Giá (₫) *" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            <Input label="Thời gian chuẩn bị (phút)" type="number" value={prepTimeMinutes} onChange={(e) => setPrepTimeMinutes(e.target.value)} />
          </div>
          {categories.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium">Danh mục (chọn nhiều)</label>
              <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--color-line)] p-3">
                {categories.map((c) => {
                  const checked = categoryIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                        checked
                          ? 'border-brand-green bg-green-50 text-brand-green'
                          : 'border-[var(--color-line)] text-[var(--color-muted)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() =>
                          setCategoryIds((prev) =>
                            checked ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                          )
                        }
                      />
                      {c.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
          <MultiImageUploader
            label="Ảnh món (có thể tải nhiều)"
            value={imageUrls}
            onChange={setImageUrls}
            onUploadingChange={setImageUploading}
            max={30}
            onUpload={(file) => uploadSellerImage(sellerApi.uploadImage, file, 'food-images')}
          />

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Nhóm tùy chọn</p>
              <p className="text-xs text-[var(--color-muted)]">Mỗi mục mẹ (Size, Tráng miệng…) chứa các lựa chọn con</p>
            </div>

            {groups.map((g, gi) => (
              <div key={gi} className="space-y-2 rounded-xl border border-[var(--color-line)] p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[10rem] flex-1">
                    <Input
                      label="Tên mục mẹ"
                      placeholder="VD: Size, Tráng miệng..."
                      value={g.name}
                      onChange={(e) => updateGroup(gi, { name: e.target.value })}
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      label="Chọn tối đa"
                      type="number"
                      min={1}
                      value={g.maxSelect}
                      onChange={(e) => updateGroup(gi, { maxSelect: e.target.value })}
                    />
                  </div>
                  <label className="mb-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={g.required}
                      onChange={(e) => updateGroup(gi, { required: e.target.checked })}
                      className="size-4 rounded border-[var(--color-line)]"
                    />
                    Bắt buộc
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mb-2"
                    onClick={() => setGroups((p) => p.filter((_, i) => i !== gi))}
                  >
                    ×
                  </Button>
                </div>

                <div className="space-y-2 pl-1">
                  <p className="text-xs font-medium text-[var(--color-muted)]">Lựa chọn con</p>
                  {g.options.map((o, oi) => (
                    <div key={oi} className="flex gap-2">
                      <Input
                        placeholder="VD: Size M, Thêm trứng..."
                        value={o.name}
                        onChange={(e) => updateOption(gi, oi, { name: e.target.value })}
                      />
                      <Input
                        placeholder="+₫"
                        type="number"
                        className="w-24 shrink-0"
                        value={o.priceDelta}
                        onChange={(e) => updateOption(gi, oi, { priceDelta: e.target.value })}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setGroups((p) =>
                            p.map((grp, i) =>
                              i === gi
                                ? { ...grp, options: grp.options.filter((_, j) => j !== oi) }
                                : grp,
                            ),
                          )
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setGroups((p) =>
                        p.map((grp, i) =>
                          i === gi
                            ? { ...grp, options: [...grp.options, { name: '', priceDelta: '0' }] }
                            : grp,
                        ),
                      )
                    }
                  >
                    + Thêm lựa chọn
                  </Button>
                </div>
              </div>
            ))}

            <Button type="button" size="sm" variant="outline" onClick={() => setGroups((p) => [...p, emptyGroup()])}>
              + Thêm mục mẹ
            </Button>

            <label className="flex items-start gap-3 rounded-xl border border-[var(--color-line)] px-3 py-3 text-sm">
              <input
                type="checkbox"
                checked={offerUtensils}
                onChange={(e) => setOfferUtensils(e.target.checked)}
                className="mt-0.5 size-4 rounded border-[var(--color-line)]"
              />
              <span>
                <span className="font-medium">Dụng cụ ăn</span>
                <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                  Khách có thể chọn “Cần dụng cụ ăn” khi mua
                </span>
              </span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => saveMut.mutate()}
              loading={saveMut.isPending || imageUploading}
              disabled={name.trim().length < 2 || !price || Number(price) <= 0 || imageUploading}
            >
              {editingId ? 'Lưu thay đổi' : 'Thêm món'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Huỷ</Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">Đang tải...</p>
      ) : filtered.length === 0 ? (
        <Card className="py-12 text-center">
          <UtensilsCrossed className="mx-auto size-10 text-[var(--color-muted)]" />
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {search ? 'Không tìm thấy món' : 'Chưa có món nào'}
          </p>
          {approved && !search && (
            <Button size="sm" variant="green" className="mt-3" onClick={openCreate}>+ Thêm món đầu tiên</Button>
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
                  <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-orange-50 text-brand-orange">
                    <UtensilsCrossed className="size-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.name}</p>
                  <p className="font-semibold text-brand-orange">{formatPrice(item.price)}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {item.prepTimeMinutes ?? 20} phút · {(item.optionGroups?.length ?? 0)} nhóm · {countOptions(item)} tùy chọn
                  </p>
                  <StatusBadge variant={item.isAvailable ? 'green' : 'gray'}>{item.isAvailable ? 'Đang bán' : 'Tạm ẩn'}</StatusBadge>
                </div>
              </div>
              {item.description && <p className="line-clamp-2 text-xs text-[var(--color-muted)]">{item.description}</p>}
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

      {!approved && (
        <p className="text-center text-sm text-[var(--color-muted)]">Cửa hàng chưa được duyệt — chưa thể thêm/sửa sản phẩm</p>
      )}

      {approved && (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-[var(--color-line)] bg-white p-3 lg:hidden">
          <Button className="w-full" variant="green" onClick={() => (showForm && !editingId ? setShowForm(false) : openCreate())}>
            {showForm ? 'Đóng form' : '+ Thêm món'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Xóa món này?"
        description={deleteTarget ? `“${deleteTarget.name}” sẽ bị xóa khỏi menu.` : undefined}
        confirmLabel="Xóa"
        cancelLabel="Huỷ"
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
