import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type AdminCategory } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { QueryErrorState } from '@/components/ui/query-state';

export function AdminCategoriesPage() {
  const qc = useQueryClient();
  const { data, isError, refetch } = useQuery({ queryKey: ['admin-categories'], queryFn: () => adminApi.categories() });
  const [name, setName] = useState('');
  const [type, setType] = useState<'food' | 'laundry'>('food');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteCat, setDeleteCat] = useState<{ id: string; name: string } | null>(null);

  const add = useMutation({
    mutationFn: () => adminApi.addCategory({ name, type, isActive: true, sortOrder: 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      setName('');
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ name: string; isActive: boolean; sortOrder: number }> }) =>
      adminApi.updateCategory(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      setEditId(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      setDeleteCat(null);
    },
  });

  const foodCats = (data?.data ?? []).filter((c) => c.type === 'food');
  const laundryCats = (data?.data ?? []).filter((c) => c.type === 'laundry');

  const renderCategory = (c: AdminCategory) => (
    <Card key={c.id} className="flex flex-wrap justify-between items-center gap-3">
      {editId === c.id ? (
        <div className="flex flex-1 flex-wrap gap-2 items-end">
          <Input label="Tên danh mục" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <Button size="sm" onClick={() => update.mutate({ id: c.id, body: { name: editName } })} loading={update.isPending}>Lưu</Button>
          <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Hủy</Button>
        </div>
      ) : (
        <>
          <div>
            <p className="font-semibold">{c.name}</p>
            <p className="text-xs text-[var(--color-muted)]">{c.slug} · {c.type}</p>
            <StatusBadge variant={c.isActive ? 'green' : 'gray'}>{c.isActive ? 'Hoạt động' : 'Ẩn'}</StatusBadge>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setEditId(c.id); setEditName(c.name); }}>Sửa</Button>
            <Button size="sm" variant="outline" onClick={() => update.mutate({ id: c.id, body: { isActive: !c.isActive } })}>
              {c.isActive ? 'Ẩn' : 'Bật'}
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDeleteCat({ id: c.id, name: c.name })}>Xóa</Button>
          </div>
        </>
      )}
    </Card>
  );

  if (isError) {
    return <QueryErrorState message="Không tải được danh mục" onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-4">
      <h1 className="font-bold">Danh mục</h1>
      <Card className="space-y-3 max-w-lg">
        <Input label="Tên danh mục mới" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Loại</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'food' | 'laundry')}
            className="w-full rounded-2xl border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm"
          >
            <option value="food">Ăn uống</option>
            <option value="laundry">Giặt đồ</option>
          </select>
        </div>
        <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!name.trim()}>Thêm danh mục</Button>
      </Card>
      <div className="space-y-2">
        <h2 className="font-semibold">Ăn uống</h2>
        {foodCats.map(renderCategory)}
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold">Giặt đồ</h2>
        {laundryCats.map(renderCategory)}
      </div>
      <ConfirmDialog
        open={Boolean(deleteCat)}
        title={`Xóa danh mục "${deleteCat?.name}"?`}
        description="Món ăn đang gắn danh mục này sẽ bỏ liên kết danh mục. Không hoàn tác được."
        confirmLabel="Xóa"
        cancelLabel="Giữ lại"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => deleteCat && remove.mutate(deleteCat.id)}
        onCancel={() => setDeleteCat(null)}
      />
    </div>
  );
}
