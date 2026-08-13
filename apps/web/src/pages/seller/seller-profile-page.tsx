import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Store } from 'lucide-react';
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
import { sellerStatusVariant, useSellerShop } from './seller-shared';

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
  const [autoConfirmLaundryQuote, setAutoConfirmLaundryQuote] = useState(false);

  const save = useMutation({
    mutationFn: () => sellerApi.updateShop({
      shopName: shopName || shop?.shopName,
      description: description || shop?.description || undefined,
      businessAddress: businessAddress || shop?.businessAddress || undefined,
      avatarUrl: avatarUrl ?? shop?.avatarUrl ?? undefined,
      phone: shopPhone.trim() || null,
      openHours: openHours.trim() || null,
      serviceAreas: serviceAreasText
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      avgDeliveryMinutes: avgDeliveryMinutes.trim() ? Number(avgDeliveryMinutes) : null,
      ...(shop?.serviceTypes === 'laundry'
        ? { autoConfirmLaundryQuote }
        : {}),
      ...(shop?.serviceTypes === 'ship_proxy' && shipProxyFee.trim()
        ? { shipProxyFee: Number(shipProxyFee) }
        : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seller-shop'] });
      toast('Đã lưu thay đổi hồ sơ cửa hàng', 'success');
      setEditing(false);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không lưu được', 'error'),
  });

  const toggleAutoConfirm = useMutation({
    mutationFn: (next: boolean) => sellerApi.updateShop({ autoConfirmLaundryQuote: next }),
    onSuccess: (_res, next) => {
      setAutoConfirmLaundryQuote(next);
      qc.invalidateQueries({ queryKey: ['seller-shop'] });
      toast(next ? 'Đã bật tự xác nhận báo giá' : 'Đã tắt tự xác nhận báo giá', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không cập nhật được', 'error'),
  });

  useEffect(() => {
    if (shop) {
      setShopName(shop.shopName);
      setDescription(shop.description ?? '');
      setBusinessAddress(shop.businessAddress ?? '');
      setAvatarUrl(shop.avatarUrl ?? null);
      setServiceAreasText((shop.serviceAreas ?? []).join(', '));
      setShopPhone(shop.phone ?? '');
      setOpenHours(shop.openHours ?? '');
      setAvgDeliveryMinutes(shop.avgDeliveryMinutes != null ? String(shop.avgDeliveryMinutes) : '');
      setShipProxyFee(shop.shipProxyFee != null ? String(shop.shipProxyFee) : '15000');
      setAutoConfirmLaundryQuote(!!shop.autoConfirmLaundryQuote);
    }
  }, [shop]);

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
              <Button size="sm" variant="outline" onClick={() => {
                if (shop) {
                  setShopName(shop.shopName);
                  setDescription(shop.description ?? '');
                  setBusinessAddress(shop.businessAddress ?? '');
                  setAvatarUrl(shop.avatarUrl ?? null);
                  setServiceAreasText((shop.serviceAreas ?? []).join(', '));
                  setShopPhone(shop.phone ?? '');
                  setOpenHours(shop.openHours ?? '');
                  setAvgDeliveryMinutes(shop.avgDeliveryMinutes != null ? String(shop.avgDeliveryMinutes) : '');
                  setShipProxyFee(shop.shipProxyFee != null ? String(shop.shipProxyFee) : '15000');
                  setAutoConfirmLaundryQuote(!!shop.autoConfirmLaundryQuote);
                }
                setEditing(false);
              }}>Hủy</Button>
            )}
          </div>
          {shop?.serviceTypes === 'laundry' && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-line)] bg-black/[0.02] px-3 py-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--color-brand-green,#16a34a)]"
                checked={autoConfirmLaundryQuote}
                disabled={toggleAutoConfirm.isPending}
                onChange={(e) => toggleAutoConfirm.mutate(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium">Tự xác nhận báo giá</span>
                <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                  Bật thì khi bạn báo giá, đơn vào “Đang giặt” luôn — khách không cần bấm xác nhận giá.
                </span>
              </span>
            </label>
          )}
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
          <Input
            label="Giờ hoạt động"
            value={openHours}
            onChange={(e) => setOpenHours(e.target.value)}
            placeholder="VD: T2–CN 8:00–21:00"
            disabled={!editing}
          />
          <p className="-mt-2 text-xs text-[var(--color-muted)]">Hiện trên trang người mua</p>
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
