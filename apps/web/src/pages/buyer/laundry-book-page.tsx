import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState, useMemo, useRef, useEffect } from 'react';
import { Banknote, Landmark, CheckCircle2, WashingMachine, Info } from 'lucide-react';
import { ordersApi, buyerApi, catalogApi } from '@/lib/api';
import { Card, Alert } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPrice, laundryUnitLabel } from '@/lib/format';
import { LaundryProcessTimeline } from '@/components/ui/order-timeline';
import { DeliveryTimePicker, windowToDate, defaultDeliveryWindow, type DeliveryWindow } from '@/components/marketplace/delivery-time-picker';
import {
  DatedTimePicker,
  datedWindowToDate,
  defaultDatedWindow,
  type DatedWindow,
} from '@/components/marketplace/dated-time-picker';
import { AddressPicker, resolveAddressId, isAddressSelectionReady, type AddressSelection } from '@/components/marketplace/address-picker';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/ui/toast';
import { invalidateBuyerLive } from '@/hooks/use-buyer-live';

const LAUNDRY_RETURN_DAYS = 14;
const LAUNDRY_GAP_MIN = 60;

export function LaundryBookPage() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user, isAuthenticated, isActiveBuyer } = useAuth();
  const idempotencyKey = useRef(crypto.randomUUID()).current;
  const [phone, setPhone] = useState(user?.phone ?? '');
  useEffect(() => {
    if (user?.phone) setPhone((p) => p || user.phone!);
  }, [user?.phone]);
  const [pickupWindow, setPickupWindow] = useState<DeliveryWindow>(() => defaultDeliveryWindow(LAUNDRY_GAP_MIN));
  const [returnWindow, setReturnWindow] = useState<DatedWindow>(() => {
    const pickup = defaultDeliveryWindow(LAUNDRY_GAP_MIN);
    const min = new Date(windowToDate(pickup, 'from').getTime() + LAUNDRY_GAP_MIN * 60 * 1000);
    return defaultDatedWindow(min, LAUNDRY_GAP_MIN);
  });
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [sameReturnAddress, setSameReturnAddress] = useState(true);
  const [pickupSel, setPickupSel] = useState<AddressSelection | null>(null);
  const [returnSel, setReturnSel] = useState<AddressSelection | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: svcData, isLoading: loadingSvc } = useQuery({ queryKey: ['laundry'], queryFn: () => catalogApi.laundry() });
  const service = svcData?.data.find((s) => s.id === serviceId);
  const { data: addrData } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => buyerApi.addresses(),
    enabled: isAuthenticated,
  });
  const addresses = addrData?.data ?? [];

  const pickupStart = windowToDate(pickupWindow, 'from').getTime();
  const minReturnAt = useMemo(() => new Date(pickupStart + LAUNDRY_GAP_MIN * 60 * 1000), [pickupStart]);
  const returnStart = datedWindowToDate(returnWindow, 'from').getTime();
  const returnAfterPickup = returnStart >= minReturnAt.getTime();

  useEffect(() => {
    if (returnStart < minReturnAt.getTime()) {
      setReturnWindow(defaultDatedWindow(minReturnAt, LAUNDRY_GAP_MIN));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [minReturnAt]);

  const book = useMutation({
    mutationFn: (ids: { pickupAddressId: string; returnAddressId: string; contactPhone: string }) =>
      ordersApi.createLaundry({
        serviceId: serviceId!,
        estimatedQty: 1,
        pickupScheduledAt: windowToDate(pickupWindow, 'from').toISOString(),
        returnScheduledAt: datedWindowToDate(returnWindow, 'from').toISOString(),
        pickupAddressId: ids.pickupAddressId,
        returnAddressId: ids.returnAddressId,
        phone: ids.contactPhone,
        notes: notes || undefined,
        paymentMethod,
      }, idempotencyKey),
    onSuccess: (res) => {
      invalidateBuyerLive(qc);
      qc.invalidateQueries({ queryKey: ['addresses'] });
      toast(`Đặt giặt thành công · ${res.data.summary ?? 'Dịch vụ giặt'}`, 'success');
      navigate(`/orders/${res.data.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = async () => {
    if (!pickupSel || !isAddressSelectionReady(pickupSel)) {
      setError('Vui lòng chọn hoặc nhập địa chỉ lấy đồ');
      return;
    }
    if (!sameReturnAddress && (!returnSel || !isAddressSelectionReady(returnSel))) {
      setError('Vui lòng chọn hoặc nhập địa chỉ giao lại');
      return;
    }
    if (!returnAfterPickup) {
      setError('Giờ giao lại phải sau giờ lấy ít nhất 1 tiếng');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const pickupAddressId = await resolveAddressId(pickupSel);
      const returnAddressId = sameReturnAddress
        ? pickupAddressId
        : await resolveAddressId(returnSel!);
      const contactPhone =
        pickupSel.mode === 'manual' ? pickupSel.draft.phone : phone;
      await book.mutateAsync({ pickupAddressId, returnAddressId, contactPhone });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể đặt giặt');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className="mx-auto max-w-md py-10 text-center">
        <p>Vui lòng đăng nhập để đặt giặt.</p>
        <Link to="/auth/login" className="mt-2 inline-block font-semibold text-brand-orange">Đăng nhập</Link>
      </Card>
    );
  }

  if (!isActiveBuyer) {
    return (
      <Card className="mx-auto max-w-md py-10 text-center space-y-2">
        <p className="font-semibold">Chưa thể đặt giặt</p>
        <p className="text-sm text-[var(--color-muted)]">Xác minh email hoặc chuyển sang chế độ Người mua.</p>
        <Link to="/auth/check-email"><Button className="mt-2">Hướng dẫn xác minh</Button></Link>
      </Card>
    );
  }

  if (loadingSvc) return <p className="py-12 text-center text-sm text-[var(--color-muted)]">Đang tải...</p>;
  if (!service) {
    return (
      <Card className="mx-auto max-w-md py-10 text-center">
        <p className="text-[var(--color-muted)]">Không tìm thấy dịch vụ</p>
        <Link to="/laundry"><Button className="mt-4" variant="green">Quay lại</Button></Link>
      </Card>
    );
  }

  const unit = laundryUnitLabel(service.unit);
  const canSubmit =
    isAddressSelectionReady(pickupSel) &&
    (sameReturnAddress || isAddressSelectionReady(returnSel)) &&
    returnAfterPickup &&
    (pickupSel?.mode === 'manual' ? true : phone.length >= 9);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-green text-white">
          <WashingMachine className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Đặt {service.name}</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {service.shopName}
            {service.estimatedTimeHours != null && ` · ~${service.estimatedTimeHours}h`}
            {service.shopOpenHours?.trim() && ` · ${service.shopOpenHours.trim()}`}
          </p>
          {(service.shopPhone?.trim() || service.shopAddress?.trim()) && (
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {service.shopPhone?.trim() && (
                <a href={`tel:${service.shopPhone.trim()}`} className="font-medium text-brand-orange hover:underline">
                  {service.shopPhone.trim()}
                </a>
              )}
              {service.shopPhone?.trim() && service.shopAddress?.trim() && ' · '}
              {service.shopAddress?.trim()}
            </p>
          )}
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex gap-2.5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>Giá theo bảng giá quán. Tiệm cân/đếm khi lấy đồ rồi báo giá chính thức cho bạn.</p>
      </div>

      <Card className="space-y-3">
        {pickupSel?.mode !== 'manual' && (
          <Input label="Số điện thoại liên hệ" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        )}
        <div>
          <p className="mb-1.5 text-sm font-medium">Thời gian lấy đồ *</p>
          <DeliveryTimePicker
            value={pickupWindow}
            onChange={setPickupWindow}
            minGapMinutes={LAUNDRY_GAP_MIN}
            title="Chọn giờ lấy đồ"
            hint="Khoảng lấy đồ tối thiểu 1 tiếng."
          />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Thời gian giao lại *</p>
          <DatedTimePicker
            value={returnWindow}
            onChange={setReturnWindow}
            minDateTime={minReturnAt}
            daysAhead={LAUNDRY_RETURN_DAYS}
            minGapMinutes={LAUNDRY_GAP_MIN}
            title="Chọn ngày giao lại"
            hint="Giao lại sau giờ lấy ít nhất 1 tiếng. Có thể chọn trong 14 ngày tới."
          />
          {!returnAfterPickup && (
            <p className="mt-1 text-xs text-red-600">Giờ giao lại phải sau giờ lấy ít nhất 1 tiếng.</p>
          )}
        </div>
        <Input label="Ghi chú cho cửa hàng" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ví dụ: có áo len, giặt riêng..." />
      </Card>

      <Card className="space-y-4">
        <AddressPicker
          label="Địa chỉ lấy đồ"
          addresses={addresses}
          value={pickupSel}
          onChange={setPickupSel}
          defaultPhone={phone}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sameReturnAddress} onChange={(e) => setSameReturnAddress(e.target.checked)} />
          Giao lại cùng địa chỉ lấy đồ
        </label>
        {!sameReturnAddress && (
          <AddressPicker
            label="Địa chỉ giao lại"
            addresses={addresses}
            value={returnSel}
            onChange={setReturnSel}
            defaultPhone={phone}
          />
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Phương thức thanh toán</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { id: 'cash' as const, icon: Banknote, title: 'Thanh toán cho shipper', desc: 'Trả khi nhận đồ' },
            { id: 'bank_transfer' as const, icon: Landmark, title: 'Chuyển khoản', desc: 'Theo hướng dẫn quán' },
          ]).map(({ id, icon: Icon, title, desc }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPaymentMethod(id)}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                paymentMethod === id ? 'border-brand-green bg-green-50/50' : 'border-[var(--color-line)] hover:border-brand-green/40',
              )}
            >
              <Icon className="size-5 text-brand-green" />
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-xs text-[var(--color-muted)]">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-[var(--color-muted)]">Đơn giá</span><span>{formatPrice(service.basePrice)}/{unit}</span></div>
        <p className="pt-1 text-xs text-[var(--color-muted)]">Tổng tiền chốt khi tiệm cân/đếm và báo giá.</p>
      </Card>

      <Card><LaundryProcessTimeline /></Card>

      <Button
        className="w-full"
        variant="green"
        size="lg"
        loading={submitting || book.isPending}
        disabled={!canSubmit}
        onClick={() => void handleSubmit()}
      >
        <CheckCircle2 className="size-4" />
        {submitting || book.isPending ? 'Đang gửi yêu cầu...' : 'Xác nhận đặt giặt'}
      </Button>
    </div>
  );
}
