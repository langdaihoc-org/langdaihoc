import { useEffect, useState } from 'react';
import type { Address } from '@/lib/api';
import { buyerApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/brand';
import { Input } from '@/components/ui/input';
import { MapPin, PenLine, BookUser } from 'lucide-react';

export function formatAddressLine(a: Pick<Address, 'detail' | 'dormName' | 'roomNumber'>) {
  // Không hiện "Giao tại tòa/rào" — điểm giao nằm trong thông tin quán.
  return [a.detail, a.dormName].filter(Boolean).join(' · ');
}

export type ManualAddressDraft = {
  recipientName: string;
  phone: string;
  detail: string;
  dormName: string;
  saveToProfile: boolean;
};

export type AddressSelection =
  | { mode: 'saved'; addressId: string }
  | { mode: 'manual'; draft: ManualAddressDraft };

const emptyDraft = (phone = ''): ManualAddressDraft => ({
  recipientName: '',
  phone,
  detail: '',
  dormName: '',
  saveToProfile: true,
});

export function isAddressSelectionReady(sel: AddressSelection | null): boolean {
  if (!sel) return false;
  if (sel.mode === 'saved') return !!sel.addressId;
  const d = sel.draft;
  return (
    d.recipientName.trim().length >= 2 && d.phone.trim().length >= 9 && d.detail.trim().length >= 5
  );
}

/** Resolve selection to a saved address id (creates address when mode is manual). */
export async function resolveAddressId(sel: AddressSelection): Promise<string> {
  if (sel.mode === 'saved') return sel.addressId;
  const d = sel.draft;
  const dormName = d.dormName.trim();
  const res = await buyerApi.addAddress({
    recipientName: d.recipientName.trim(),
    phone: d.phone.trim(),
    detail: d.detail.trim(),
    dormName: dormName || undefined,
    addressType: dormName ? 'dorm' : 'other',
    isDefault: d.saveToProfile,
  });
  return res.data.id;
}

export function AddressPicker({
  label,
  addresses,
  value,
  onChange,
  defaultPhone,
  emptyHint,
}: {
  label?: string;
  addresses: Address[];
  value: AddressSelection | null;
  onChange: (sel: AddressSelection) => void;
  defaultPhone?: string;
  emptyHint?: string;
}) {
  const initialMode = addresses.length > 0 ? 'saved' : 'manual';
  const [mode, setMode] = useState<'saved' | 'manual'>(
    value?.mode ?? initialMode,
  );

  useEffect(() => {
    if (addresses.length > 0) {
      // Nếu đã chọn địa chỉ saved hợp lệ, hoặc form manual đã đủ → giữ nguyên
      if (value?.mode === 'saved' && addresses.some((a) => a.id === value.addressId)) return;
      if (value?.mode === 'manual' && isAddressSelectionReady(value)) return;
      // addresses vừa load (trước đó rỗng) hoặc selection chưa sẵn sàng → ưu tiên địa chỉ mặc định
      const def = addresses.find((a) => a.isDefault) ?? addresses[0];
      if (!def) return;
      onChange({ mode: 'saved', addressId: def.id });
      setMode('saved');
      return;
    }
    if (!value) {
      onChange({ mode: 'manual', draft: emptyDraft(defaultPhone) });
      setMode('manual');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when address list arrives
  }, [addresses.length]);

  const draft = value?.mode === 'manual' ? value.draft : emptyDraft(defaultPhone ?? '');
  const selectedId = value?.mode === 'saved' ? value.addressId : null;

  const setDraft = (patch: Partial<ManualAddressDraft>) => {
    onChange({ mode: 'manual', draft: { ...draft, ...patch } });
  };

  const switchMode = (next: 'saved' | 'manual') => {
    setMode(next);
    if (next === 'saved') {
      const def = addresses.find((a) => a.isDefault) ?? addresses[0];
      if (def) onChange({ mode: 'saved', addressId: def.id });
    } else {
      onChange({ mode: 'manual', draft: emptyDraft(defaultPhone ?? '') });
    }
  };

  return (
    <div className="space-y-3">
      {label ? <p className="text-sm font-semibold">{label}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => switchMode('saved')}
          disabled={addresses.length === 0}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
            mode === 'saved'
              ? 'border-brand-orange bg-orange-50 text-brand-orange'
              : 'border-[var(--color-line)] text-[var(--color-muted)] hover:bg-black/[0.02]',
            addresses.length === 0 && 'cursor-not-allowed opacity-50',
          )}
        >
          <BookUser className="size-4" />
          Đã lưu
        </button>
        <button
          type="button"
          onClick={() => switchMode('manual')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
            mode === 'manual'
              ? 'border-brand-orange bg-orange-50 text-brand-orange'
              : 'border-[var(--color-line)] text-[var(--color-muted)] hover:bg-black/[0.02]',
          )}
        >
          <PenLine className="size-4" />
          Nhập mới
        </button>
      </div>

      {mode === 'saved' ? (
        addresses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-line)] px-3 py-4 text-sm text-[var(--color-muted)]">
            {emptyHint ?? 'Chưa có địa chỉ đã lưu. Chọn “Nhập mới” hoặc thêm trong mục Tôi.'}
          </div>
        ) : (
          <div className="space-y-2">
            {addresses.map((a) => {
              const selected = selectedId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onChange({ mode: 'saved', addressId: a.id })}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                    selected ? 'border-brand-green bg-green-50/50' : 'border-[var(--color-line)] hover:border-brand-green/40',
                  )}
                >
                  <MapPin className={cn('mt-0.5 size-4 shrink-0', selected ? 'text-brand-green' : 'text-[var(--color-muted)]')} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.recipientName} · {a.phone}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">{formatAddressLine(a)}</p>
                    {a.isDefault && <StatusBadge variant="green">Mặc định</StatusBadge>}
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-3 rounded-xl border border-[var(--color-line)] p-3">
          <Input
            label="Người nhận *"
            value={draft.recipientName}
            onChange={(e) => setDraft({ recipientName: e.target.value })}
            placeholder="Họ tên"
          />
          <Input
            label="Số điện thoại *"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={draft.phone}
            onChange={(e) => setDraft({ phone: e.target.value })}
            placeholder="090..."
          />
          <Input
            label="Địa chỉ chi tiết *"
            value={draft.detail}
            onChange={(e) => setDraft({ detail: e.target.value })}
            placeholder="Khu / đường..."
          />
          <Input
            label="KTX / Tòa"
            value={draft.dormName}
            onChange={(e) => setDraft({ dormName: e.target.value })}
            placeholder="KTX B, KTX A..."
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.saveToProfile}
              onChange={(e) => setDraft({ saveToProfile: e.target.checked })}
            />
            Lưu làm địa chỉ mặc định
          </label>
        </div>
      )}
    </div>
  );
}
