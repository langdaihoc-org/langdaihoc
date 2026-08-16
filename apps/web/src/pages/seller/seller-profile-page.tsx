import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Store, Trash2 } from 'lucide-react';
import { sellerApi, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { serviceTypeLabel, sellerStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/ui/brand';
import { FoodProductManager, LaundryProductManager } from '@/components/seller/product-crud';
import { ImageUploader, uploadSellerImage } from '@/components/ui/image-uploader';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import {
  coerceHHMM,
  normalizeOperatingWindows,
  type OperatingWindow,
} from '@/lib/operating-hours';
import { sellerStatusVariant, useSellerShop } from './seller-shared';

function loadShopForm(shop: NonNullable<ReturnType<typeof useSellerShop>['data']>['data']) {
  if (!shop) {
    return {
      shopName: '',
      description: '',
      businessAddress: '',
      avatarUrl: null as string | null,
      serviceAreasText: '',
      shopPhone: '',
      openHours: '',
      avgDeliveryMinutes: '',
      shipProxyFee: '15000',
      operatingWindows: [] as OperatingWindow[],
      laundryMinReturnGapMinutes: '60',
      minDeliveryWindowMinutes: '30',
    };
  }
  return {
    shopName: shop.shopName,
    description: shop.description ?? '',
    businessAddress: shop.businessAddress ?? '',
    avatarUrl: shop.avatarUrl ?? null,
    serviceAreasText: (shop.serviceAreas ?? []).join(', '),
    shopPhone: shop.phone ?? '',
    openHours: shop.openHours ?? '',
    avgDeliveryMinutes: shop.avgDeliveryMinutes != null ? String(shop.avgDeliveryMinutes) : '',
    shipProxyFee: shop.shipProxyFee != null ? String(shop.shipProxyFee) : '15000',
    operatingWindows: (shop.operatingWindows?.length
      ? shop.operatingWindows.map((w) => ({ from: w.from, to: w.to }))
      : []) as OperatingWindow[],
    laundryMinReturnGapMinutes:
      shop.laundryMinReturnGapMinutes != null ? String(shop.laundryMinReturnGapMinutes) : '60',
    minDeliveryWindowMinutes:
      shop.minDeliveryWindowMinutes != null ? String(shop.minDeliveryWindowMinutes) : '30',
  };
}

export function SellerProfilePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useSellerShop();
  const shop = data?.data;
  const [tab, setTab] = useState<'info' | 'products'>('info');
  const [editing, setEditing] = useState(false);
  const [shopName, setShopName] = useState('');
  const [description, setDescription] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [serviceAreasText, setServiceAreasText] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [openHours, setOpenHours] = useState('');
  const [avgDeliveryMinutes, setAvgDeliveryMinutes] = useState('');
  const [shipProxyFee, setShipProxyFee] = useState('');
  const [operatingWindows, setOperatingWindows] = useState<OperatingWindow[]>([]);
  const [laundryMinReturnGapMinutes, setLaundryMinReturnGapMinutes] = useState('60');
  const [minDeliveryWindowMinutes, setMinDeliveryWindowMinutes] = useState('30');

  const applyForm = (form: ReturnType<typeof loadShopForm>) => {
    setShopName(form.shopName);
    setDescription(form.description);
    setBusinessAddress(form.businessAddress);
    setAvatarUrl(form.avatarUrl);
    setServiceAreasText(form.serviceAreasText);
    setShopPhone(form.shopPhone);
    setOpenHours(form.openHours);
    setAvgDeliveryMinutes(form.avgDeliveryMinutes);
    setShipProxyFee(form.shipProxyFee);
    setOperatingWindows(form.operatingWindows);
    setLaundryMinReturnGapMinutes(form.laundryMinReturnGapMinutes);
    setMinDeliveryWindowMinutes(form.minDeliveryWindowMinutes);
  };

  const save = useMutation({
    mutationFn: () => {
      const isLaundry = shop?.serviceTypes === 'laundry';
      const isFood = shop?.serviceTypes === 'food';
      /**
       * Quán ăn cũng phải gửi operatingWindows.
       *
       * `checkoutFood` có sẵn đoạn chặn đặt ngoài giờ dựa trên trường này, nhưng
       * trước đây chỉ tiệm giặt mới được gửi lên — nên với quán ăn nó luôn null và
       * đoạn chặn đó không bao giờ chạy. Kết quả: quán khai "17:50–22:10" mà khách
       * vẫn đặt được lúc 16:20.
       *
       * Khi đã có khung giờ thì API tự sinh chuỗi `openHours` hiển thị từ chúng,
       * nên không gửi kèm openHours nữa để khỏi có hai nguồn sự thật lệch nhau.
       */
      const dungKhungGio = isLaundry || isFood;
      const normalizedWindows = normalizeOperatingWindows(operatingWindows);
      return sellerApi.updateShop({
        shopName: shopName || shop?.shopName,
        description: description || shop?.description || undefined,
        businessAddress: businessAddress || shop?.businessAddress || undefined,
        avatarUrl: avatarUrl ?? shop?.avatarUrl ?? undefined,
        phone: shopPhone.trim() || null,
        ...(!dungKhungGio ? { openHours: openHours.trim() || null } : {}),
        ...(dungKhungGio ? { operatingWindows: normalizedWindows } : {}),
        ...(isLaundry
          ? {
              laundryMinReturnGapMinutes: laundryMinReturnGapMinutes.trim()
                ? Number(laundryMinReturnGapMinutes)
                : 60,
            }
          : {}),
        ...(isFood
          ? {
              minDeliveryWindowMinutes: minDeliveryWindowMinutes.trim()
                ? Number(minDeliveryWindowMinutes)
                : 30,
            }
          : {}),
        serviceAreas: serviceAreasText
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean),
        avgDeliveryMinutes: avgDeliveryMinutes.trim() ? Number(avgDeliveryMinutes) : null,
        ...(shop?.serviceTypes === 'ship_proxy' && shipProxyFee.trim()
          ? { shipProxyFee: Number(shipProxyFee) }
          : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-shop'] });
      toast('Đã lưu thay đổi hồ sơ cửa hàng', 'success');
      setEditing(false);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không lưu được', 'error'),
  });

  useEffect(() => {
    if (shop) applyForm(loadShopForm(shop));
  }, [shop]);

  const resetFromShop = () => {
    if (shop) applyForm(loadShopForm(shop));
    setEditing(false);
  };

  const updateWindow = (index: number, key: 'from' | 'to', value: string) => {
    setOperatingWindows((prev) =>
      prev.map((w, i) => (i === index ? { ...w, [key]: value } : w)),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-green-50 text-2xl">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <Store className="size-8 text-brand-green" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{shop?.shopName ?? 'Cửa hàng'}</h1>
          <p className="text-sm text-[var(--color-muted)]">{shop ? serviceTypeLabel(shop.serviceTypes) : '—'}</p>
          <StatusBadge variant={sellerStatusVariant(shop?.status)}>
            {sellerStatusLabel(shop?.status ?? 'pending')}
          </StatusBadge>
        </div>
      </div>

      {shop?.status === 'rejected' && shop.rejectionReason && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Lý do từ chối:</strong> {shop.rejectionReason}
        </div>
      )}

      {shop?.status === 'pending' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Cửa hàng đang chờ admin duyệt. Bạn có thể cập nhật hồ sơ và xem sản phẩm, nhưng chưa thể nhận đơn mới.
        </div>
      )}

      <div className="flex border-b border-[var(--color-line)]">
        {([
          ['info', 'Thông tin cửa hàng'],
          ...(shop?.serviceTypes === 'ship_proxy' ? [] : [['products', 'Sản phẩm'] as const]),
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 py-2.5 text-sm font-medium transition-colors',
              tab === id ? 'border-b-2 border-brand-green text-brand-green' : 'text-[var(--color-muted)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'info' ? (
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">Hồ sơ cửa hàng của bạn</p>
            {!editing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Sửa</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={resetFromShop}>Hủy</Button>
            )}
          </div>
          <ImageUploader
            label="Ảnh cửa hàng"
            value={avatarUrl}
            onChange={setAvatarUrl}
            disabled={!editing}
            onUpload={(file) => uploadSellerImage(sellerApi.uploadImage, file, 'food-images')}
          />
          <Input label="Tên quán" value={shopName} onChange={(e) => setShopName(e.target.value)} disabled={!editing} />
          <Input label="Địa chỉ kinh doanh" value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} disabled={!editing} />
          <Input
            label="SĐT liên hệ quán"
            type="tel"
            inputMode="tel"
            value={shopPhone}
            onChange={(e) => setShopPhone(e.target.value)}
            placeholder="09xxxxxxxx"
            disabled={!editing}
          />
          <p className="-mt-2 text-xs text-[var(--color-muted)]">Người mua sẽ thấy để liên lạc khi cần</p>

          {shop?.serviceTypes === 'laundry' || shop?.serviceTypes === 'food' ? (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Khung giờ hoạt động</label>
                <div className="space-y-2">
                  {operatingWindows.length === 0 && (
                    <p className="rounded-xl border border-dashed border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-muted)]">
                      Chưa có khung giờ — thêm ít nhất một khung (VD: 09:00–12:00).
                    </p>
                  )}
                  {operatingWindows.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="09:00"
                        maxLength={5}
                        aria-label={`Giờ bắt đầu khung ${i + 1}`}
                        value={w.from}
                        onChange={(e) => updateWindow(i, 'from', e.target.value)}
                        onBlur={(e) => updateWindow(i, 'from', coerceHHMM(e.target.value))}
                        disabled={!editing}
                        className="h-11 flex-1 rounded-xl border border-[var(--color-line)] px-3 font-mono text-sm tabular-nums disabled:bg-black/[0.02]"
                      />
                      <span className="text-sm text-[var(--color-muted)]">–</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="22:00"
                        maxLength={5}
                        aria-label={`Giờ kết thúc khung ${i + 1}`}
                        value={w.to}
                        onChange={(e) => updateWindow(i, 'to', e.target.value)}
                        onBlur={(e) => updateWindow(i, 'to', coerceHHMM(e.target.value))}
                        disabled={!editing}
                        className="h-11 flex-1 rounded-xl border border-[var(--color-line)] px-3 font-mono text-sm tabular-nums disabled:bg-black/[0.02]"
                      />
                      {editing && (
                        <button
                          type="button"
                          aria-label="Xóa khung giờ"
                          onClick={() => setOperatingWindows((prev) => prev.filter((_, j) => j !== i))}
                          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--color-line)] text-[var(--color-muted)] hover:border-red-200 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {editing && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setOperatingWindows((prev) => [...prev, { from: '09:00', to: '12:00' }])}
                    >
                      <Plus className="size-4" />
                      Thêm khung giờ
                    </Button>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                  {shop?.serviceTypes === 'laundry'
                    ? 'Người mua chỉ chọn giờ lấy/giao trong các khung này. VD: 09:00–12:00 và 17:00–22:00.'
                    : 'Người mua chỉ chọn được giờ giao trong các khung này — để trống là nhận đơn bất kỳ giờ nào. VD: 17:00–22:00.'}
                </p>
              </div>
              {shop?.serviceTypes === 'laundry' && (
                <>
                  <Input
                    label="Giao lại sau giờ lấy tối thiểu (phút)"
                    type="number"
                    min={30}
                    step={10}
                    value={laundryMinReturnGapMinutes}
                    onChange={(e) => setLaundryMinReturnGapMinutes(e.target.value)}
                    placeholder="60"
                    disabled={!editing}
                  />
                  <p className="-mt-2 text-xs text-[var(--color-muted)]">
                    VD: 60 = khách phải chọn giờ giao lại cách giờ lấy ít nhất 1 tiếng.
                  </p>
                </>
              )}
            </>
          ) : (
            <>
              <Input
                label="Giờ hoạt động"
                value={openHours}
                onChange={(e) => setOpenHours(e.target.value)}
                placeholder="VD: T2–CN 8:00–21:00"
                disabled={!editing}
              />
              <p className="-mt-2 text-xs text-[var(--color-muted)]">Hiện trên trang người mua</p>
            </>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Loại hình</label>
            <p className="rounded-xl border border-[var(--color-line)] bg-black/[0.02] px-3 py-2 text-sm">
              {shop ? serviceTypeLabel(shop.serviceTypes) : '—'}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Mô tả cửa hàng</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              disabled={!editing}
              placeholder="Giới thiệu quán, giờ mở cửa, khu vực giao..."
              className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm disabled:bg-black/[0.02]"
            />
          </div>
          <Input
            label="Khu vực phục vụ / giao"
            value={serviceAreasText}
            onChange={(e) => setServiceAreasText(e.target.value)}
            placeholder="KTX A, KTX B, Bcons, Làng SV..."
            disabled={!editing}
          />
          <p className="-mt-2 text-xs text-[var(--color-muted)]">Phân cách bằng dấu phẩy — hiện trên trang người mua</p>
          {shop?.serviceTypes === 'food' && (
            <>
              <Input
                label="Thời gian giao trung bình (phút)"
                type="number"
                min={1}
                step={1}
                value={avgDeliveryMinutes}
                onChange={(e) => setAvgDeliveryMinutes(e.target.value)}
                placeholder="Ví dụ: 25"
                disabled={!editing}
              />
              <p className="-mt-2 text-xs text-[var(--color-muted)]">Từ lúc nhận đơn đến giao thành công (vd: 25 phút)</p>
              <Input
                label="Khoảng giờ giao tối thiểu (phút)"
                type="number"
                min={10}
                step={10}
                value={minDeliveryWindowMinutes}
                onChange={(e) => setMinDeliveryWindowMinutes(e.target.value)}
                placeholder="30"
                disabled={!editing}
              />
              <p className="-mt-2 text-xs text-[var(--color-muted)]">
                Khi khách chọn &apos;Từ–Đến&apos;, khoảng cách tối thiểu giữa hai mốc. VD: 30 = ít nhất nửa tiếng.
              </p>
            </>
          )}
          {shop?.serviceTypes === 'ship_proxy' && (
            <>
              <Input
                label="Phí nhận hộ (đồng)"
                type="number"
                min={1000}
                step={1000}
                value={shipProxyFee}
                onChange={(e) => setShipProxyFee(e.target.value)}
                placeholder="15000"
                disabled={!editing}
              />
              <p className="-mt-2 text-xs text-[var(--color-muted)]">Khách sẽ thấy phí này khi gửi yêu cầu. Chỉ nhận chuyển khoản.</p>
            </>
          )}
          {editing && (
            <Button onClick={() => save.mutate()} loading={save.isPending}>Lưu thay đổi</Button>
          )}
        </Card>
      ) : !shop ? (
        <Card className="py-10 text-center text-sm text-[var(--color-muted)]">Đang tải sản phẩm...</Card>
      ) : shop.serviceTypes === 'ship_proxy' ? (
        <Card className="py-10 text-center text-sm text-[var(--color-muted)]">Tài khoản nhận đồ ship hộ không có sản phẩm catalog</Card>
      ) : shop.serviceTypes === 'laundry' ? (
        <LaundryProductManager approved={shop.status === 'approved'} />
      ) : (
        <FoodProductManager approved={shop.status === 'approved'} />
      )}
    </div>
  );
}
