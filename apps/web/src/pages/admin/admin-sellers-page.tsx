import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { serviceTypeLabel, sellerStatusLabel, formatPrice } from '@/lib/format';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { QueryErrorState } from '@/components/ui/query-state';
import { useToast } from '@/components/ui/toast';

export function AdminSellersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isError, refetch } = useQuery({ queryKey: ['admin-sellers'], queryFn: () => adminApi.sellers() });
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveId, setApproveId] = useState<string | null>(null);
  const [serviceTypes, setServiceTypes] = useState<'food' | 'laundry'>('food');
  const [showShipForm, setShowShipForm] = useState(false);
  const [shipForm, setShipForm] = useState({
    fullName: '', email: '', phone: '', password: '', shopName: '', serviceAreas: '',
  });
  const [shipError, setShipError] = useState<string | null>(null);
  const [deleteSeller, setDeleteSeller] = useState<{ id: string; shopName: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmResetMonth, setConfirmResetMonth] = useState(false);

  const periodStartedAt = data?.meta?.billingPeriodStartedAt ?? null;

  const resetMonth = useMutation({
    mutationFn: () => adminApi.resetBillingPeriod(),
    onSuccess: (res) => {
      setConfirmResetMonth(false);
      qc.invalidateQueries({ queryKey: ['admin-sellers'] });
      toast(res.message ?? 'Đã bắt đầu tháng mới — thống kê về 0', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không reset được kỳ tháng', 'error'),
  });

  const approve = useMutation({
    mutationFn: ({
      id, status, rejectionReason, serviceTypes: st,
    }: {
      id: string; status: string; rejectionReason?: string; serviceTypes?: 'food' | 'laundry';
    }) => adminApi.approveSeller(id, status, rejectionReason, st),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-sellers'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      setRejectId(null);
      setRejectReason('');
      setApproveId(null);
    },
  });

  const manage = useMutation({
    mutationFn: (payload: { id: string; status: string }) =>
      adminApi.updateSeller(payload.id, { status: payload.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-sellers'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteSeller(id),
    onSuccess: () => {
      setDeleteSeller(null);
      qc.invalidateQueries({ queryKey: ['admin-sellers'] });
      qc.invalidateQueries({ queryKey: ['admin-audit-logs'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const createShip = useMutation({
    mutationFn: () =>
      adminApi.createShipSeller({
        fullName: shipForm.fullName.trim(),
        email: shipForm.email.trim().toLowerCase(),
        phone: shipForm.phone.trim(),
        password: shipForm.password,
        shopName: shipForm.shopName.trim(),
        businessAddress: 'KTX ĐHQG',
        serviceAreas: shipForm.serviceAreas
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean),
        description: 'Nhận đồ ship hộ trong khu KTX',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-sellers'] });
      setShowShipForm(false);
      setShipError(null);
      setShipForm({
        fullName: '', email: '', phone: '', password: '', shopName: '', serviceAreas: '',
      });
    },
    onError: (e) => setShipError(e instanceof ApiError ? e.message : 'Không tạo được tài khoản'),
  });

  const pending = (data?.data ?? []).filter((r) => r.seller.status === 'pending' && r.seller.serviceTypes !== 'ship_proxy');
  const managed = (data?.data ?? []).filter((r) =>
    r.seller.status === 'approved' || r.seller.status === 'suspended' || r.seller.status === 'rejected',
  );
  const busy = approve.isPending || manage.isPending || remove.isPending;
  const actionError = (approve.error ?? manage.error ?? remove.error) as ApiError | null;

  if (isError) {
    return <QueryErrorState message="Không tải được danh sách đối tác" onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-bold">Quản lý đối tác</h1>
          <p className="text-xs text-[var(--color-muted)]">
            Duyệt hồ sơ, tạm dừng / mở lại / xóa vĩnh viễn — tên & địa chỉ do cửa hàng tự sửa ở hồ sơ seller
          </p>
          {periodStartedAt ? (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Kỳ tháng hiện tại từ {new Date(periodStartedAt).toLocaleString('vi-VN')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setConfirmResetMonth(true)}>
            Bắt đầu tháng mới
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowShipForm((v) => !v)}>
            {showShipForm ? 'Đóng' : '+ Thêm người nhận đồ ship hộ'}
          </Button>
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-red-600">{actionError.message ?? 'Không thực hiện được thao tác'}</p>
      )}

      {showShipForm && (
        <Card className="space-y-3">
          <p className="font-semibold">Tạo tài khoản nhận đồ ship hộ (nội bộ)</p>
          <p className="text-xs text-[var(--color-muted)]">Chỉ phục vụ KTX — không mở đăng ký công khai</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Họ tên" value={shipForm.fullName} onChange={(e) => setShipForm((p) => ({ ...p, fullName: e.target.value }))} />
            <Input label="Email đăng nhập" type="email" value={shipForm.email} onChange={(e) => setShipForm((p) => ({ ...p, email: e.target.value }))} />
            <Input label="SĐT" type="tel" inputMode="tel" autoComplete="tel" value={shipForm.phone} onChange={(e) => setShipForm((p) => ({ ...p, phone: e.target.value }))} />
            <Input label="Mật khẩu tạm" type="password" value={shipForm.password} onChange={(e) => setShipForm((p) => ({ ...p, password: e.target.value }))} />
            <Input label="Tên hiển thị" value={shipForm.shopName} onChange={(e) => setShipForm((p) => ({ ...p, shopName: e.target.value }))} />
            <Input label="KTX phục vụ (phẩy)" value={shipForm.serviceAreas} onChange={(e) => setShipForm((p) => ({ ...p, serviceAreas: e.target.value }))} placeholder="KTX A, KTX B, KTX C..." />
          </div>
          {shipError && <p className="text-sm text-red-500">{shipError}</p>}
          <Button
            size="sm"
            variant="green"
            loading={createShip.isPending}
            onClick={() => createShip.mutate()}
            disabled={!shipForm.fullName || !shipForm.email || !shipForm.phone || shipForm.password.length < 8 || !shipForm.shopName}
          >
            Tạo & duyệt luôn
          </Button>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">Chờ duyệt ăn uống / giặt đồ</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Không có hồ sơ chờ duyệt</p>
        ) : pending.map((row) => {
          const s = row.seller;
          return (
            <Card key={s.id} className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <p className="font-semibold">{s.shopName}</p>
                <p className="text-xs text-[var(--color-muted)]">{row.fullName} · {row.email} · {row.phone ?? '—'}</p>
                <p className="text-xs text-[var(--color-muted)]">Muốn bán: {s.serviceTypes ? serviceTypeLabel(s.serviceTypes) : '—'}</p>
                {s.description && <p className="mt-1 text-xs text-[var(--color-muted)]">{s.description}</p>}
                <StatusBadge variant="orange">{sellerStatusLabel('pending')}</StatusBadge>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  variant="green"
                  disabled={busy}
                  onClick={() => {
                    setApproveId(s.id);
                    setServiceTypes((s.serviceTypes as 'food' | 'laundry') ?? 'food');
                  }}
                >
                  Duyệt
                </Button>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => setRejectId(s.id)}>Từ chối</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setDeleteSeller({ id: s.id, shopName: s.shopName })}>Xóa</Button>
              </div>
              {approveId === s.id && (
                <div className="w-full space-y-2 border-t border-[var(--color-line)] pt-3">
                  <p className="text-xs text-[var(--color-muted)]">
                    Chỉ cần duyệt — tên quán, địa chỉ, menu do đối tác tự cập nhật sau khi được mở bán.
                  </p>
                  <p className="text-sm">
                    <span className="text-[var(--color-muted)]">Hồ sơ đăng ký:</span>{' '}
                    <strong>{s.shopName}</strong> · {s.businessAddress || 'Chưa có địa chỉ'}
                  </p>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium">Loại dịch vụ được duyệt</label>
                    <select
                      value={serviceTypes}
                      onChange={(e) => setServiceTypes(e.target.value as 'food' | 'laundry')}
                      className="w-full rounded-2xl border border-[var(--color-line)] bg-white px-4 py-2.5 text-sm"
                    >
                      <option value="food">Ăn uống</option>
                      <option value="laundry">Giặt đồ</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="green"
                      loading={approve.isPending}
                      onClick={() => approve.mutate({
                        id: s.id,
                        status: 'approved',
                        serviceTypes,
                      })}
                    >
                      Xác nhận duyệt
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setApproveId(null)}>Hủy</Button>
                  </div>
                </div>
              )}
              {rejectId === s.id && (
                <div className="w-full space-y-2 border-t border-[var(--color-line)] pt-3">
                  <Input label="Lý do từ chối" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  <Button size="sm" variant="danger" onClick={() => approve.mutate({ id: s.id, status: 'rejected', rejectionReason: rejectReason })}>Xác nhận từ chối</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">Cửa hàng / đối tác (đã duyệt · tạm dừng · từ chối)</h2>
        {managed.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Chưa có đối tác nào</p>
        ) : managed.map((row) => {
          const s = row.seller;
          const statusVariant = s.status === 'approved' ? 'green' : s.status === 'suspended' ? 'red' : 'orange';
          const expanded = expandedId === s.id;
          return (
            <Card key={s.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setExpandedId(expanded ? null : s.id)}
                >
                  <p className="font-semibold">{s.shopName}</p>
                  <p className="text-xs text-[var(--color-muted)]">{row.fullName} · {row.email} · {row.phone ?? '—'}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {serviceTypeLabel(s.serviceTypes)} · {s.businessAddress || 'Chưa có địa chỉ'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge variant={statusVariant}>{sellerStatusLabel(s.status)}</StatusBadge>
                    <span className="text-[11px] font-medium text-brand-green">
                      {expanded ? 'Thu gọn' : 'Xem thống kê tháng'}
                    </span>
                  </div>
                </button>
                <div className="flex flex-wrap gap-2">
                  {s.status === 'approved' && (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={manage.isPending}
                      disabled={busy}
                      onClick={() => manage.mutate({ id: s.id, status: 'suspended' })}
                    >
                      Tạm dừng
                    </Button>
                  )}
                  {(s.status === 'suspended' || s.status === 'rejected') && (
                    <Button
                      size="sm"
                      variant="green"
                      loading={manage.isPending}
                      disabled={busy}
                      onClick={() => manage.mutate({ id: s.id, status: 'approved' })}
                    >
                      {s.status === 'rejected' ? 'Duyệt lại' : 'Mở lại'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    loading={remove.isPending}
                    disabled={busy}
                    onClick={() => setDeleteSeller({ id: s.id, shopName: s.shopName })}
                  >
                    Xóa
                  </Button>
                </div>
              </div>
              {expanded ? (
                <div className="grid gap-2 border-t border-[var(--color-line)] pt-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-green-50/60 px-3 py-2">
                    <p className="text-[11px] text-[var(--color-muted)]">Tổng số đơn tháng</p>
                    <p className="text-lg font-bold">{row.monthlyOrderCount ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-orange-50/60 px-3 py-2">
                    <p className="text-[11px] text-[var(--color-muted)]">Tổng doanh thu tháng</p>
                    <p className="text-lg font-bold">{formatPrice(row.monthlyRevenue ?? 0)}</p>
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
      <ConfirmDialog
        open={!!deleteSeller}
        title={`Xóa vĩnh viễn đối tác "${deleteSeller?.shopName}"?`}
        description="Tài khoản đăng nhập cũng bị xóa, không khôi phục được. Nếu còn lịch sử đơn hàng hệ thống sẽ từ chối — hãy tạm dừng thay vì xóa."
        confirmLabel="Xóa vĩnh viễn"
        cancelLabel="Giữ lại"
        variant="danger"
        loading={remove.isPending}
        onCancel={() => setDeleteSeller(null)}
        onConfirm={() => deleteSeller && remove.mutate(deleteSeller.id)}
      />
      <ConfirmDialog
        open={confirmResetMonth}
        title="Bắt đầu tháng mới?"
        description="Thống kê Tổng doanh thu tháng và Tổng số đơn tháng của mọi đối tác sẽ về 0 và tính lại từ thời điểm này cho đến khi bạn bấm lại."
        confirmLabel="Bắt đầu tháng mới"
        cancelLabel="Hủy"
        variant="danger"
        loading={resetMonth.isPending}
        onCancel={() => setConfirmResetMonth(false)}
        onConfirm={() => resetMonth.mutate()}
      />
    </div>
  );
}
