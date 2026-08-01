import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, ApiError, type AdminUser } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/auth-context';
import { ROLE_LABEL, USER_STATUS_LABEL } from './admin-shared';

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [userAction, setUserAction] = useState<null | {
    id: string;
    email: string;
    kind: 'suspend' | 'delete';
  }>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', roleFilter, statusFilter, search],
    queryFn: () =>
      adminApi.users({
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        q: search || undefined,
      }),
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      adminApi.updateUser(id, { status }),
    onSuccess: () => {
      setUserAction(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      qc.invalidateQueries({ queryKey: ['admin-sellers'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => {
      setUserAction(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      qc.invalidateQueries({ queryKey: ['admin-sellers'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const busy = update.isPending || remove.isPending;
  const actionError = (update.error ?? remove.error) as ApiError | null;
  const users = data?.data ?? [];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-bold">Quản lý người dùng</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Tìm, lọc, khóa / mở khóa. Xóa là xóa vĩnh viễn (không khôi phục được).
        </p>
      </div>

      <Card className="flex flex-wrap gap-3">
        <Input
          label="Tìm email / tên"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="buyer@..."
        />
        <div className="space-y-1.5 min-w-[140px]">
          <label className="block text-sm font-medium">Vai trò</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full rounded-2xl border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm"
          >
            <option value="">Tất cả</option>
            <option value="buyer">Người mua</option>
            <option value="seller">Đối tác</option>
            <option value="admin">Quản trị</option>
          </select>
        </div>
        <div className="space-y-1.5 min-w-[160px]">
          <label className="block text-sm font-medium">Trạng thái</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-2xl border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm"
          >
            <option value="">Tất cả</option>
            <option value="active">Hoạt động</option>
            <option value="suspended">Đã khóa</option>
            <option value="pending_email_verification">Chờ xác minh</option>
          </select>
        </div>
      </Card>

      {actionError && (
        <p className="text-sm text-red-600">
          {actionError.message ?? 'Không cập nhật được người dùng'}
        </p>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-[var(--color-muted)]">Đang tải...</p>
      ) : users.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-[var(--color-muted)]">Không có người dùng phù hợp</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {users.map((u: AdminUser) => {
            const isSelf = me?.id === u.id;
            return (
              <Card key={u.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold truncate">{u.fullName || '—'}</p>
                    <StatusBadge
                      variant={
                        u.status === 'active'
                          ? 'green'
                          : u.status === 'suspended'
                            ? 'red'
                            : 'orange'
                      }
                    >
                      {USER_STATUS_LABEL[u.status] ?? u.status}
                    </StatusBadge>
                    {isSelf && <StatusBadge variant="gray">Bạn</StatusBadge>}
                  </div>
                  <p className="text-sm text-[var(--color-muted)] truncate">{u.email}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {ROLE_LABEL[u.role] ?? u.role}
                    {u.phone ? ` · ${u.phone}` : ''}
                    {' · '}
                    {new Date(u.createdAt).toLocaleDateString('vi')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {u.status !== 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSelf || busy}
                      onClick={() => update.mutate({ id: u.id, status: 'active' })}
                    >
                      Mở khóa
                    </Button>
                  )}
                  {u.status !== 'suspended' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSelf || busy}
                      onClick={() => setUserAction({ id: u.id, email: u.email, kind: 'suspend' })}
                    >
                      Khóa
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={isSelf || busy}
                    onClick={() => setUserAction({ id: u.id, email: u.email, kind: 'delete' })}
                  >
                    Xóa
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!userAction}
        title={
          userAction?.kind === 'suspend'
            ? `Khóa tài khoản ${userAction.email}?`
            : `Xóa vĩnh viễn ${userAction?.email}?`
        }
        description={
          userAction?.kind === 'suspend'
            ? 'Người này sẽ không đăng nhập được cho đến khi được mở khóa.'
            : 'Không khôi phục được. Nếu còn lịch sử đơn hàng hệ thống sẽ từ chối — hãy khóa thay vì xóa.'
        }
        confirmLabel={userAction?.kind === 'suspend' ? 'Khóa' : 'Xóa vĩnh viễn'}
        cancelLabel="Hủy"
        variant="danger"
        loading={busy}
        onCancel={() => setUserAction(null)}
        onConfirm={() => {
          if (!userAction) return;
          if (userAction.kind === 'suspend') update.mutate({ id: userAction.id, status: 'suspended' });
          else remove.mutate(userAction.id);
        }}
      />
    </div>
  );
}
