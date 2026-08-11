import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { MapPin, Phone, Banknote, Landmark, CheckCircle2 } from 'lucide-react';
import { ordersApi, buyerApi, cartApi } from '@/lib/api';
import { Card, Alert } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPrice } from '@/lib/format';
import { DeliveryTimePicker, windowToDate, type DeliveryWindow } from '@/components/marketplace/delivery-time-picker';
import { AddressPicker, resolveAddressId, isAddressSelectionReady, type AddressSelection } from '@/components/marketplace/address-picker';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/ui/toast';
import { QueryErrorState } from '@/components/ui/query-state';
import { invalidateBuyerLive } from '@/hooks/use-buyer-live';

export function CheckoutPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user, isActiveBuyer, isAuthenticated } = useAuth();
  const idempotencyKey = useRef(crypto.randomUUID()).current;
  const [phone, setPhone] = useState(user?.phone ?? '');
  useEffect(() => {
    if (user?.phone) setPhone((p) => p || user.phone!);
  }, [user?.phone]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [notes, setNotes] = useState('');
  const [deliveryWindow, setDeliveryWindow] = useState<DeliveryWindow>({ day: 'today', from: '12:00', to: '12:30' });
  const [error, setError] = useState('');
  const [addressSel, setAddressSel] = useState<AddressSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { data: cartData, isLoading: loadingCart, isError: errCart, refetch: refetchCart } = useQuery({ queryKey: ['cart'], queryFn: () => cartApi.get() });
  const { data: addrData } = useQuery({ queryKey: ['addresses'], queryFn: () => buyerApi.addresses() });
  const addresses = addrData?.data ?? [];
  const total = cartData?.data?.subtotal ?? 0;

  const checkout = useMutation({
    mutationFn: (addressId: string) => ordersApi.checkoutFood({
      addressId,
      phone: addressSel?.mode === 'manual' ? addressSel.draft.phone || phone : phone,
      paymentMethod,
      desiredDeliveryAt: windowToDate(deliveryWindow, 'from').toISOString(),
      notes: notes || undefined,
    }, idempotencyKey),
    onSuccess: (res) => {
      invalidateBuyerLive(qc);
      qc.invalidateQueries({ queryKey: ['cart'] });
      qc.invalidateQueries({ queryKey: ['addresses'] });
      toast(`Đặt hàng thành công · ${res.data.summary ?? 'Món ăn'}`, 'success');
      navigate(`/orders/${res.data.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = async () => {
    if (!addressSel || !isAddressSelectionReady(addressSel)) {
      setError('Vui lòng chọn hoặc nhập địa chỉ giao hàng');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const addressId = await resolveAddressId(addressSel);
      if (addressSel.mode === 'manual' && addressSel.draft.phone) {
        setPhone(addressSel.draft.phone);
      }
      await checkout.mutateAsync(addressId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể đặt hàng');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className="mx-auto max-w-md py-10 text-center">
        <p>Vui lòng đăng nhập để thanh toán.</p>
        <Link to="/auth/login" className="mt-2 inline-block font-semibold text-brand-orange">Đăng nhập</Link>
      </Card>
    );
  }

  if (!isActiveBuyer) {
    return (
      <Card className="mx-auto max-w-md py-10 text-center space-y-2">
        <p className="font-semibold">Chưa thể đặt hàng</p>
        <p className="text-sm text-[var(--color-muted)]">Xác minh email hoặc chuyển sang chế độ Người mua.</p>
        <Link to="/auth/check-email"><Button className="mt-2">Hướng dẫn xác minh</Button></Link>
      </Card>
    );
  }

  if (loadingCart) {
    return <p className="py-12 text-center text-sm text-[var(--color-muted)]">Đang tải giỏ hàng...</p>;
  }
  if (errCart) {
    return <QueryErrorState message="Không tải được giỏ hàng" onRetry={() => refetchCart()} className="mx-auto max-w-md" />;
  }
  if (!cartData?.data?.items?.length) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-[var(--color-muted)]">Giỏ hàng trống.</p>
        <Link to="/food"><Button className="mt-4">Quay lại đặt món</Button></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Xác nhận đơn hàng</h1>
      {error && <Alert variant="error">{error}</Alert>}

      <Card className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="size-4 text-brand-orange" /> Địa chỉ giao hàng
        </h2>
        <AddressPicker
          label=""
          addresses={addresses}
          value={addressSel}
          onChange={setAddressSel}
          defaultPhone={phone}
        />
        {addressSel?.mode === 'saved' && (
          <div>
            <label htmlFor="checkout-phone" className="mb-1.5 block text-sm font-medium text-gray-700">
              Số điện thoại liên hệ
            </label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                id="checkout-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--color-line)] pl-9 pr-3 text-sm outline-none focus:border-brand-orange/50 focus-visible:ring-2 focus-visible:ring-brand-orange/40"
                placeholder="090..."
                autoComplete="tel"
              />
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Thời gian giao</h2>
        <DeliveryTimePicker value={deliveryWindow} onChange={setDeliveryWindow} />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Phương thức thanh toán</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { id: 'cash' as const, icon: Banknote, title: 'Thanh toán cho shipper', desc: 'Trả tiền khi nhận hàng' },
            { id: 'bank_transfer' as const, icon: Landmark, title: 'Chuyển khoản', desc: 'Qua tài khoản ngân hàng' },
          ]).map(({ id, icon: Icon, title, desc }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPaymentMethod(id)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                paymentMethod === id ? 'border-brand-orange bg-orange-50/50' : 'border-[var(--color-line)] hover:border-brand-orange/40',
              )}
            >
              <Icon className="size-5 text-brand-orange" />
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-xs text-[var(--color-muted)]">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <Input label="Ghi chú thêm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ví dụ: gọi trước khi giao..." />
      </Card>

      <Button
        className="w-full"
        size="lg"
        loading={submitting || checkout.isPending}
        disabled={!isAddressSelectionReady(addressSel)}
        onClick={() => void handleSubmit()}
      >
        <CheckCircle2 className="size-4" />
        {submitting || checkout.isPending ? 'Đang đặt hàng...' : `Đặt hàng · ${formatPrice(total)}`}
      </Button>
    </div>
  );
}
