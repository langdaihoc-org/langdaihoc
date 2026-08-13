import { useId, useMemo, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { WheelColumn } from './wheel-column';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import {
  type OperatingWindow,
  filterTimesInOperatingWindows,
  isWindowInsideOperatingHours,
  normalizeOperatingWindows,
  toMinutes,
} from '@/lib/operating-hours';

export interface DeliveryWindow {
  day: 'today' | 'tomorrow';
  from: string;
  to: string;
}

const STEP_MIN = 10;

function timeSlots() {
  const slots: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += STEP_MIN) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      slots.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}` });
    }
  }
  return slots;
}

const ALL_SLOTS = timeSlots();

export function formatWindow(w: DeliveryWindow): string {
  const day = w.day === 'today' ? 'Hôm nay' : 'Ngày mai';
  return `${day}, ${w.from} – ${w.to}`;
}

/** Đổi cửa sổ Hôm nay/Ngày mai thành Date (cạnh from hoặc to). */
export function windowToDate(w: DeliveryWindow, edge: 'from' | 'to' = 'from'): Date {
  const d = new Date();
  if (w.day === 'tomorrow') d.setDate(d.getDate() + 1);
  const [h, m] = w[edge].split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

const DAY_ITEMS = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'tomorrow', label: 'Ngày mai' },
];

function firstValidWindow(
  minGapMinutes: number,
  allowedWindows?: OperatingWindow[] | null,
  preferFromMinutes?: number,
): DeliveryWindow | null {
  const gapSlots = Math.max(1, Math.ceil(minGapMinutes / STEP_MIN));
  const ranges = normalizeOperatingWindows(allowedWindows);
  const startMin = preferFromMinutes ?? 0;
  for (const slot of ALL_SLOTS) {
    const fromM = toMinutes(slot.value);
    if (fromM < startMin) continue;
    const fromIdx = ALL_SLOTS.findIndex((s) => s.value === slot.value);
    const toIdx = fromIdx + gapSlots;
    if (toIdx >= ALL_SLOTS.length) continue;
    const to = ALL_SLOTS[toIdx]!.value;
    if (isWindowInsideOperatingHours(slot.value, to, ranges, minGapMinutes)) {
      return { day: 'today', from: slot.value, to };
    }
  }
  for (const slot of ALL_SLOTS) {
    const fromIdx = ALL_SLOTS.findIndex((s) => s.value === slot.value);
    const toIdx = fromIdx + gapSlots;
    if (toIdx >= ALL_SLOTS.length) continue;
    const to = ALL_SLOTS[toIdx]!.value;
    if (isWindowInsideOperatingHours(slot.value, to, ranges, minGapMinutes)) {
      return { day: 'tomorrow', from: slot.value, to };
    }
  }
  return null;
}

export function defaultDeliveryWindow(
  minGapMinutes = 10,
  allowedWindows?: OperatingWindow[] | null,
): DeliveryWindow {
  const now = new Date();
  const rounded = Math.ceil((now.getHours() * 60 + now.getMinutes() + 20) / STEP_MIN) * STEP_MIN;
  const found = firstValidWindow(minGapMinutes, allowedWindows, rounded);
  if (found) return found;
  const fromIdx = Math.min(ALL_SLOTS.length - 2, Math.max(0, Math.floor(rounded / STEP_MIN)));
  const gapSlots = Math.max(1, Math.ceil(minGapMinutes / STEP_MIN));
  const toIdx = Math.min(ALL_SLOTS.length - 1, fromIdx + gapSlots);
  return {
    day: 'today',
    from: ALL_SLOTS[fromIdx]!.value,
    to: ALL_SLOTS[toIdx]!.value,
  };
}

export function DeliveryTimePicker({
  value,
  onChange,
  className,
  minGapMinutes = 10,
  allowedWindows,
  title = 'Chọn thời gian giao',
  hint,
}: {
  value: DeliveryWindow;
  onChange: (w: DeliveryWindow) => void;
  className?: string;
  /** Khoảng Từ → Đến tối thiểu (phút). */
  minGapMinutes?: number;
  /** Chỉ cho chọn giờ trong các khung hoạt động của quán (nếu có). */
  allowedWindows?: OperatingWindow[] | null;
  title?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DeliveryWindow>(value);
  const titleId = useId();
  const gapSlots = Math.max(1, Math.ceil(minGapMinutes / STEP_MIN));
  const ranges = useMemo(() => normalizeOperatingWindows(allowedWindows), [allowedWindows]);

  const fromItems = useMemo(() => {
    const allowed = filterTimesInOperatingWindows(
      ALL_SLOTS.map((s) => s.value),
      ranges,
    );
    const maxFrom = 24 * 60 - minGapMinutes;
    return ALL_SLOTS.filter(
      (s) => allowed.includes(s.value) && toMinutes(s.value) <= maxFrom,
    );
  }, [ranges, minGapMinutes]);

  const toItems = useMemo(() => {
    const min = toMinutes(draft.from) + minGapMinutes;
    return ALL_SLOTS.filter((s) => {
      if (toMinutes(s.value) < min) return false;
      return isWindowInsideOperatingHours(draft.from, s.value, ranges, minGapMinutes);
    });
  }, [draft.from, minGapMinutes, ranges]);

  const invalid =
    fromItems.length === 0 ||
    toItems.length === 0 ||
    !isWindowInsideOperatingHours(draft.from, draft.to, ranges, minGapMinutes);

  function handleFromChange(from: string) {
    setDraft((d) => {
      const next = { ...d, from };
      if (!isWindowInsideOperatingHours(from, next.to, ranges, minGapMinutes)) {
        const idx = ALL_SLOTS.findIndex((s) => s.value === from);
        let to = ALL_SLOTS[Math.min(ALL_SLOTS.length - 1, idx + gapSlots)]!.value;
        for (let i = idx + gapSlots; i < ALL_SLOTS.length; i++) {
          const candidate = ALL_SLOTS[i]!.value;
          if (isWindowInsideOperatingHours(from, candidate, ranges, minGapMinutes)) {
            to = candidate;
            break;
          }
        }
        next.to = to;
      }
      return next;
    });
  }

  function confirmDraft() {
    if (invalid) return;
    onChange(draft);
    setOpen(false);
  }

  const hoursHint =
    ranges.length > 0
      ? `Chỉ chọn trong giờ quán mở: ${ranges.map((w) => `${w.from}–${w.to}`).join(' · ')}.`
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setOpen(true);
        }}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-left text-sm font-medium transition-colors hover:border-brand-orange/40',
          className,
        )}
      >
        <Clock className="size-4 shrink-0 text-brand-orange" />
        {formatWindow(value)}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        titleId={titleId}
        zIndexClass="z-[70]"
        panelClassName="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="font-bold">
            {title}
          </h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Đóng"
            className="flex size-11 items-center justify-center rounded-full hover:bg-black/5"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 items-center gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2">
          <WheelColumn
            ariaLabel="Chọn ngày"
            items={DAY_ITEMS}
            value={draft.day}
            onChange={(v) => setDraft((d) => ({ ...d, day: v as DeliveryWindow['day'] }))}
          />
          <WheelColumn
            ariaLabel="Giờ bắt đầu"
            items={fromItems.length ? fromItems : ALL_SLOTS}
            value={draft.from}
            onChange={handleFromChange}
          />
          <WheelColumn
            ariaLabel="Giờ kết thúc"
            items={toItems.length ? toItems : ALL_SLOTS}
            value={draft.to}
            onChange={(v) => setDraft((d) => ({ ...d, to: v }))}
          />
        </div>

        <div className="mt-2 grid grid-cols-3 px-2 text-center text-xs font-medium text-[var(--color-muted)]">
          <span>Ngày</span>
          <span>Từ</span>
          <span>Đến</span>
        </div>

        <div className="mt-3 rounded-2xl bg-[var(--color-surface)] px-4 py-3 text-center text-sm">
          Khoảng: <span className="font-semibold">{formatWindow(draft)}</span>
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          {hint ?? `Khoảng cách tối thiểu ${minGapMinutes} phút.`}
          {hoursHint ? ` ${hoursHint}` : ''}
        </p>
        {fromItems.length === 0 && (
          <p className="mt-2 text-xs text-red-600">
            Quán chưa có khung giờ phù hợp với khoảng tối thiểu {minGapMinutes} phút.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button className="flex-1" disabled={invalid} onClick={confirmDraft}>
            Xác nhận
          </Button>
        </div>
      </Modal>
    </>
  );
}
