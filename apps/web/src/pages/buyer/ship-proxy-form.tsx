import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogApi, ordersApi, ApiError } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, EmptyState } from '@/components/ui/card';
import { ListSkeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import { invalidateBuyerLive } from '@/hooks/use-buyer-live';
import { ShopContactCard } from '@/components/marketplace/shop-contact-card';
import {
  DeliveryTimePicker,
  defaultDeliveryWindow,
  formatWindow,
  windowToDate,
  type DeliveryWindow,
} from '@/components/marketplace/delivery-time-picker';
import {
  DatedTimePicker,
  datedWindowToDate,
  defaultDatedWindow,
  formatDatedWindow,
  type DatedWindow,
} from '@/components/marketplace/dated-time-picker';

const SHIP_GAP_MIN = 30;
/** Cho phép chọn ngày nhận lại trong 30 ngày kể từ mốc tối thiểu. */
const RETURN_DAYS_AHEAD = 30;

export function ShipProxyForm({ preferredSellerId }: { preferredSellerId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAuthenticated, isActiveBuyer } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['sellers', 'ship_proxy'],
    queryFn: () => catalogApi.sellers('ship_proxy'),
  });

  const store = useMemo(() => {
    const list = data?.data ?? [];
    if (preferredSellerId) return list.find((s) => s.id === preferredSellerId) ?? list[0] ?? null;
    return list[0] ?? null;
  }, [data, preferredSellerId]);

  const fee = Number(store?.shipProxyFee ?? 15000);

  const [trackingCode, setTrackingCode] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [pickupWindow, setPickupWindow] = useState<DeliveryWindow>(() => defaultDeliveryWindow(SHIP_GAP_MIN));
  const [receivePhone, setReceivePhone] = useState('');
  const [returnWindow, setReturnWindow] = useState<DatedWindow>(() => {
    const pickup = defaultDeliveryWindow(SHIP_GAP_MIN);
    const min = new Date(windowToDate(pickup, 'from').getTime() + SHIP_GAP_MIN * 60 * 1000);
    return defaultDatedWindow(min, SHIP_GAP_MIN);
  });
  const [returnAddressText, setReturnAddressText] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [packageValue, setPackageValue] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID()).current;

  const pickupStart = windowToDate(pickupWindow, 'from').getTime();
  const minReturnAt = useMemo(() => new Date(pickupStart + SHIP_GAP_MIN * 60 * 1000), [pickupStart]);
  const returnStart = datedWindowToDate(returnWindow, 'from').getTime();
  const returnAfterPickup = returnStart >= minReturnAt.getTime();

  useEffect(() => {
    if (returnStart < minReturnAt.getTime()) {
      setReturnWindow(defaultDatedWindow(minReturnAt, SHIP_GAP_MIN));
    }
    // Chỉ đồng bộ khi đổi mốc tối thiểu — tránh loop theo returnWindow
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [minReturnAt]);

  const packageValueNum = Number(packageValue.replace(/\D/g, ''));
  const missing: string[] = [];
  if (trackingCode.trim().length < 2) missing.push('số shipper');
  if (pickupLocation.trim().length < 3) missing.push('vị trí lấy');
  if (receivePhone.trim().length < 9) missing.push('SĐT nhận đơn hàng');
  if (!returnAddressText.trim()) missing.push('địa chỉ nhận lại');
  if (contactPhone.trim().length < 9) missing.push('SĐT liên lạc');
  if (!Number.isFinite(packageValueNum) || packageValueNum <= 0) missing.push('giá tiền hàng nhận hộ');
  if (!returnAfterPickup) missing.push('ngày/giờ nhận lại (sau giờ lấy ≥ 30 phút)');

  const canSubmit = missing.length === 0 && Number.isFinite(fee) && fee > 0;
  const payTotal =
    Number.isFinite(packageValueNum) && packageValueNum > 0 && Number.isFinite(fee) && fee > 0
      ? packageValueNum + fee
      : fee;

  const createMut = useMutation({
    mutationFn: () => {
      if (!store) throw new Error('missing seller');
      const pickupNote = `Lấy: ${formatWindow(pickupWindow)}`;
      const returnNote = `Nhận lại: ${formatDatedWindow(returnWindow)}`;
      const mergedNotes = [notes.trim(), pickupNote, returnNote].filter(Boolean).join(' | ');
      return ordersApi.createShipProxy({
        sellerId: store.id,
        trackingCode: trackingCode.trim(),
        pickupLocation: pickupLocation.trim(),
        pickupAt: windowToDate(pickupWindow, 'from').toISOString(),
        receivePhone: receivePhone.trim(),
        returnAt: datedWindowToDate(returnWindow, 'from').toISOString(),
        returnAddressText: returnAddressText.trim(),
        contactPhone: contactPhone.trim(),
        packageValue: packageValueNum,
        notes: mergedNotes || undefined,
      }, idempotencyKey);
    },
    onSuccess: (res) => {
      invalidateBuyerLive(qc);
      navigate(`/orders/${res.data.id}`);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Không thể tạo đơn'),
  });

  if (!isAuthenticated) {
    return (
      <Card className="mx-auto max-w-md py-10 text-center">
        <p>Vui lòng đăng nhập để đặt nhận hộ.</p>
        <Link to="/auth/login" className="mt-2 inline-block font-semibold text-brand-orange">
          Đăng nhập
        </Link>
      </Card>
    );
  }

  if (!isActiveBuyer) {
    return (
      <Card className="mx-auto max-w-md space-y-2 py-10 text-center">
        <p className="font-semibold">Chưa thể đặt nhận hộ</p>
        <p className="text-sm text-[var(--color-muted)]">
          Xác minh email hoặc chuyển sang chế độ Người mua.
        </p>
        <Link to="/auth/check-email">
          <Button className="mt-2">Hướng dẫn xác minh</Button>
        </Link>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Nhận đồ ship hộ</h1>
        <ListSkeleton rows={4} />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Nhận đồ ship hộ</h1>
        <EmptyState
          title="Chưa cấu hình người nhận hộ"
          description="Admin thêm tài khoản nhận đồ ship hộ ở mục Đối tác"
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    const loginFrom = preferredSellerId ? `/ship/book/${preferredSellerId}` : '/ship';
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="text-xl font-bold">Nhận đồ ship hộ</h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {store.shopName} · {formatPrice(fee)}
          </p>
        </div>
        <Card className="py-10 text-center">
          <p className="text-sm text-[var(--color-muted)]">Đăng nhập để gửi yêu cầu nhận hộ</p>
          <Button className="mt-3" onClick={() => navigate('/auth/login', { state: { from: { pathname: loginFrom } } })}>
            Đăng nhập
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-xl font-bold">Nhận đồ ship hộ</h1>
        <p className="mt-0.5 text-sm text-[var(--color-muted)]">{store.shopName} · Khu KTX</p>
      </div>

      <ShopContactCard
        shopName={store.shopName}
        phone={store.phone}
        businessAddress={store.businessAddress}
        openHours={store.openHours}
      />

      <Card className="space-y-3">
        <h2 className="font-semibold">Thông tin lấy hàng</h2>
        <Input
          label="Số shipper *"
          placeholder="VD: số điện thoại shipper Shopee, GHN..."
          value={trackingCode}
          onChange={(e) => setTrackingCode(e.target.value)}
        />
        <Input
          label="Vị trí lấy hàng *"
          placeholder="VD: Bưu cục KTX B, cổng A..."
          value={pickupLocation}
          onChange={(e) => setPickupLocation(e.target.value)}
        />
        <div>
          <p className="mb-1.5 text-sm font-medium">Thời gian lấy hàng *</p>
          <DeliveryTimePicker
            value={pickupWindow}
            onChange={setPickupWindow}
            minGapMinutes={SHIP_GAP_MIN}
            title="Chọn giờ lấy hàng"
            hint="Khoảng lấy hàng tối thiểu 30 phút."
          />
        </div>
        <div>
          <Input
            label="SĐT nhận đơn hàng *"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Nhập đủ 10 số, VD: 09xxxxxxxx"
            value={receivePhone}
            onChange={(e) => setReceivePhone(e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Nhập đầy đủ số điện thoại nhận đơn hàng từ shiper
          </p>
        </div>
        <div>
          <Input
            label="Giá tiền hàng nhận hộ *"
            type="text"
            inputMode="numeric"
            placeholder="VD: 150000"
            value={packageValue}
            onChange={(e) => setPackageValue(e.target.value.replace(/[^\d]/g, ''))}
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Giá trị món hàng cần nhận dùm (không phải phí nhận hộ).
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5">
          <p className="text-xs text-[var(--color-muted)]">Phí nhận hộ (do người nhận hộ đặt)</p>
          <p className="text-sm font-semibold text-brand-orange-dark">{formatPrice(fee)}</p>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Nhận lại hàng</h2>
        <div>
          <p className="mb-1.5 text-sm font-medium">Ngày & giờ muốn nhận lại *</p>
          <DatedTimePicker
            value={returnWindow}
            onChange={setReturnWindow}
            minDateTime={minReturnAt}
            daysAhead={RETURN_DAYS_AHEAD}
            minGapMinutes={SHIP_GAP_MIN}
            title="Chọn ngày nhận lại"
            hint="Có thể nhận lại nhiều ngày sau khi lấy. Chọn trong 30 ngày tới; khoảng tối thiểu 30 phút."
          />
          {!returnAfterPickup && (
            <p className="mt-1 text-xs text-red-600">Ngày/giờ nhận lại phải sau giờ lấy ít nhất 30 phút.</p>
          )}
        </div>
        <Input
          label="Địa chỉ nhận lại hàng *"
          placeholder="KTX B, giao tại tòa / rào..."
          value={returnAddressText}
          onChange={(e) => setReturnAddressText(e.target.value)}
        />
        <Input
          label="SĐT của bạn để nhận hộ gọi *"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="Số điện thoại liên lạc của bạn"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />
        <Input
          label="Ghi chú"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Hàng dễ vỡ, gọi trước khi tới..."
        />
      </Card>

      <Card className="space-y-2 text-sm">
        <h2 className="font-semibold">Thanh toán</h2>
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-950">
          Chỉ chuyển khoản. Sau khi người nhận hộ xác nhận đơn, bạn chuyển khoản ngay — họ mới đi lấy hàng.
        </p>
        <div className="flex justify-between text-[var(--color-muted)]">
          <span>Giá tiền hàng</span>
          <span>{packageValueNum > 0 ? formatPrice(packageValueNum) : '—'}</span>
        </div>
        <div className="flex justify-between text-[var(--color-muted)]">
          <span>Phí nhận hộ</span>
          <span>{formatPrice(fee)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Tổng thanh toán</span>
          <span className="text-brand-orange">{formatPrice(payTotal)}</span>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Ghi chú: số tiền thanh toán = giá tiền hàng + phí nhận hộ.
        </p>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!canSubmit && missing.length > 0 && (
        <p className="text-xs text-[var(--color-muted)]">Còn thiếu: {missing.join(', ')}</p>
      )}
      <Button
        className="w-full"
        disabled={!canSubmit}
        loading={createMut.isPending}
        onClick={() => {
          setError(null);
          createMut.mutate();
        }}
      >
        Gửi yêu cầu · {formatPrice(payTotal)}
      </Button>
    </div>
  );
}
