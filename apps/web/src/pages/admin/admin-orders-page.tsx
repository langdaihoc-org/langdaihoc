import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, ordersApi, ApiError, type Order } from '@/lib/api';
import { DataTable } from '@/components/layout/dashboard-shell';
import { StatusBadge } from '@/components/ui/brand';
import { QueryErrorState } from '@/components/ui/query-state';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  orderStatusLabel,
  formatPrice,
  orderDisplayTitle,
  paymentStatusLabel,
  paymentMethodLabel,
} from '@/lib/format';

function paymentOk(o: Order) {
  return o.paymentStatus === 'verified' || o.paymentStatus === 'paid';
}

export function AdminOrdersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-orders'],
    queryFn: () => adminApi.orders(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin-orders'] });

  const statusMut = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      ordersApi.updateStatus(id, status, note),
    onSuccess: () => {
      invalidate();
      toast('Đã cập nhật trạng thái', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không cập nhật được', 'error'),
  });

  const verifyMut = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      ordersApi.verifyPayment(id, approved, approved ? undefined : 'Admin từ chối biên lai'),
    onSuccess: (_r, v) => {
      invalidate();
      toast(v.approved ? 'Đã duyệt CK' : 'Đã từ chối CK', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không duyệt được CK', 'error'),
  });

  const paidMut = useMutation({
    mutationFn: (id: string) => ordersApi.markPaid(id),
    onSuccess: () => {
      invalidate();
      toast('Đã đánh dấu thu tiền mặt', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không đánh dấu được', 'error'),
  });

  if (isError) {
    return <QueryErrorState message="Không tải được đơn hàng" onRetry={() => void refetch()} />;
  }

  const orders = data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-bold">Tất cả đơn hàng</h1>
        <Button size="sm" variant="secondary" loading={isFetching} onClick={() => void refetch()}>
          Tải lại
        </Button>
      </div>
      <p className="text-xs text-[var(--color-muted)]">
      Admin có thể duyệt CK / thu tiền mặt và hoàn thành đơn đang giao khi đã thanh toán.
    </p>
      <DataTable
        headers={['Đơn hàng', 'TT / Thanh toán', 'Thao tác']}
        rows={orders.map((o) => [
          <div key={`${o.id}-main`} className="space-y-0.5">
            <p className="font-medium">{orderDisplayTitle(o)}</p>
            <p className="text-[11px] text-[var(--color-muted)]">
              {o.orderCode} · {formatPrice(o.total)}
            </p>
          </div>,
          <div key={`${o.id}-pay`} className="space-y-1">
            <StatusBadge>{orderStatusLabel(o.status, o.type)}</StatusBadge>
            <p className="text-[11px] text-[var(--color-muted)]">
              {paymentMethodLabel(o.paymentMethod)} · {paymentStatusLabel(o.paymentStatus)}
            </p>
          </div>,
          <div key={`${o.id}-act`} className="flex max-w-[220px] flex-col gap-1">
            {o.paymentMethod === 'bank_transfer' && o.paymentStatus === 'proof_uploaded' && (
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="green"
                  disabled={verifyMut.isPending}
                  onClick={() => verifyMut.mutate({ id: o.id, approved: true })}
                >
                  Duyệt CK
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={verifyMut.isPending}
                  onClick={() => verifyMut.mutate({ id: o.id, approved: false })}
                >
                  Từ chối CK
                </Button>
              </div>
            )}
            {o.paymentMethod === 'cash' && !paymentOk(o) && (
              <Button
                size="sm"
                variant="secondary"
                disabled={paidMut.isPending}
                onClick={() => paidMut.mutate(o.id)}
              >
                Đã thu tiền mặt
              </Button>
            )}
            {o.status === 'needs_support' && o.type === 'laundry' && (
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  disabled={statusMut.isPending}
                  onClick={() =>
                    statusMut.mutate({
                      id: o.id,
                      status: 'washing',
                      note: 'Admin mở lại sau needs_support',
                    })
                  }
                >
                  Tiếp tục giặt
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={statusMut.isPending}
                  onClick={() =>
                    statusMut.mutate({
                      id: o.id,
                      status: 'cancelled',
                      note: 'Admin hủy sau needs_support',
                    })
                  }
                >
                  Hủy đơn
                </Button>
              </div>
            )}
            {(o.status === 'delivering' || o.status === 'returning') && paymentOk(o) && (
              <Button
                size="sm"
                variant="green"
                disabled={statusMut.isPending}
                onClick={() => statusMut.mutate({ id: o.id, status: 'completed' })}
              >
                Hoàn thành
              </Button>
            )}
          </div>,
        ])}
      />
    </div>
  );
}
