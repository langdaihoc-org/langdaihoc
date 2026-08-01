import { useId, useMemo, useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { WheelColumn } from './wheel-column';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

/** Cửa sổ ngày + giờ (YYYY-MM-DD) — dùng khi cần chọn nhiều ngày sau. */
export interface DatedWindow {
  date: string;
  from: string;
  to: string;
}

const STEP_MIN = 10;
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

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

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateLabel(key: string, todayKey: string): string {
  const d = parseDateKey(key);
  const today = parseDateKey(todayKey);
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / 86_400_000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Ngày mai';
  return `${WD[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

export function formatDatedWindow(w: DatedWindow): string {
  const todayKey = toDateKey(new Date());
  return `${dateLabel(w.date, todayKey)}, ${w.from} – ${w.to}`;
}

export function datedWindowToDate(w: DatedWindow, edge: 'from' | 'to' = 'from'): Date {
  const d = parseDateKey(w.date);
  const [h, m] = w[edge].split(':').map(Number);
  d.setHours(h!, m!, 0, 0);
  return d;
}

function roundUpMinutes(totalMin: number) {
  return Math.ceil(totalMin / STEP_MIN) * STEP_MIN;
}

/** Mặc định: sau minDateTime ít nhất minGapMinutes, cửa sổ dài minGapMinutes. */
export function defaultDatedWindow(minDateTime: Date, minGapMinutes = 30): DatedWindow {
  const gapSlots = Math.max(1, Math.ceil(minGapMinutes / STEP_MIN));
  const min = new Date(minDateTime.getTime());
  let total = roundUpMinutes(min.getHours() * 60 + min.getMinutes());
  if (total >= 24 * 60) {
    min.setDate(min.getDate() + 1);
    total = 0;
  }
  const fromIdx = Math.min(ALL_SLOTS.length - 1 - gapSlots, Math.max(0, Math.floor(total / STEP_MIN)));
  const toIdx = Math.min(ALL_SLOTS.length - 1, fromIdx + gapSlots);
  return {
    date: toDateKey(min),
    from: ALL_SLOTS[fromIdx]!.value,
    to: ALL_SLOTS[toIdx]!.value,
  };
}

function buildDayItems(minDate: Date, daysAhead: number, todayKey: string) {
  const start = startOfDay(minDate);
  const items: { value: string; label: string }[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = toDateKey(d);
    items.push({ value: key, label: dateLabel(key, todayKey) });
  }
  return items;
}

export function DatedTimePicker({
  value,
  onChange,
  className,
  minDateTime,
  daysAhead = 21,
  minGapMinutes = 30,
  title = 'Chọn ngày & giờ',
  hint,
}: {
  value: DatedWindow;
  onChange: (w: DatedWindow) => void;
  className?: string;
  /** Không cho chọn trước thời điểm này (vd. sau giờ lấy ≥ 30 phút). */
  minDateTime: Date;
  /** Số ngày có thể chọn kể từ ngày tối thiểu. */
  daysAhead?: number;
  minGapMinutes?: number;
  title?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DatedWindow>(value);
  const titleId = useId();
  const gapSlots = Math.max(1, Math.ceil(minGapMinutes / STEP_MIN));
  const todayKey = toDateKey(new Date());

  const dayItems = useMemo(
    () => buildDayItems(minDateTime, daysAhead, todayKey),
    [minDateTime, daysAhead, todayKey],
  );

  const minOnSelectedDay = useMemo(() => {
    const dayStart = parseDateKey(draft.date);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    if (minDateTime.getTime() > dayEnd.getTime()) return 24 * 60;
    if (toDateKey(minDateTime) === draft.date) {
      return roundUpMinutes(minDateTime.getHours() * 60 + minDateTime.getMinutes());
    }
    return 0;
  }, [draft.date, minDateTime]);

  const fromItems = useMemo(() => {
    const maxFrom = 24 * 60 - minGapMinutes;
    return ALL_SLOTS.filter((s) => {
      const m = toMinutes(s.value);
      return m >= minOnSelectedDay && m <= maxFrom;
    });
  }, [minOnSelectedDay, minGapMinutes]);

  const toItems = useMemo(() => {
    const min = toMinutes(draft.from) + minGapMinutes;
    return ALL_SLOTS.filter((s) => toMinutes(s.value) >= min);
  }, [draft.from, minGapMinutes]);

  const invalid =
    fromItems.length === 0 ||
    toMinutes(draft.to) - toMinutes(draft.from) < minGapMinutes ||
    toMinutes(draft.from) < minOnSelectedDay ||
    !dayItems.some((d) => d.value === draft.date);

  function clampDraft(next: DatedWindow): DatedWindow {
    let date = next.date;
    if (!dayItems.some((d) => d.value === date)) {
      date = dayItems[0]?.value ?? toDateKey(minDateTime);
    }
    const dayMin =
      toDateKey(minDateTime) === date
        ? roundUpMinutes(minDateTime.getHours() * 60 + minDateTime.getMinutes())
        : 0;
    let from = next.from;
    if (toMinutes(from) < dayMin) {
      const idx = Math.min(ALL_SLOTS.length - 1 - gapSlots, Math.max(0, Math.floor(dayMin / STEP_MIN)));
      from = ALL_SLOTS[idx]!.value;
    }
    let to = next.to;
    if (toMinutes(to) - toMinutes(from) < minGapMinutes) {
      const idx = ALL_SLOTS.findIndex((s) => s.value === from);
      to = ALL_SLOTS[Math.min(ALL_SLOTS.length - 1, idx + gapSlots)]!.value;
    }
    return { date, from, to };
  }

  function handleDateChange(date: string) {
    setDraft((d) => clampDraft({ ...d, date }));
  }

  function handleFromChange(from: string) {
    setDraft((d) => clampDraft({ ...d, from }));
  }

  function openModal() {
    setDraft(clampDraft(value));
    setOpen(true);
  }

  function confirmDraft() {
    const next = clampDraft(draft);
    if (toMinutes(next.to) - toMinutes(next.from) < minGapMinutes) return;
    onChange(next);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-left text-sm font-medium transition-colors hover:border-brand-orange/40',
          className,
        )}
      >
        <CalendarClock className="size-4 shrink-0 text-brand-orange" />
        {formatDatedWindow(value)}
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
            items={dayItems}
            value={dayItems.some((d) => d.value === draft.date) ? draft.date : (dayItems[0]?.value ?? draft.date)}
            onChange={handleDateChange}
          />
          <WheelColumn
            ariaLabel="Giờ bắt đầu"
            items={fromItems.length > 0 ? fromItems : ALL_SLOTS}
            value={draft.from}
            onChange={handleFromChange}
          />
          <WheelColumn
            ariaLabel="Giờ kết thúc"
            items={toItems.length > 0 ? toItems : ALL_SLOTS}
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
          Nhận lại: <span className="font-semibold">{formatDatedWindow(draft)}</span>
        </div>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          {hint ?? `Có thể chọn trong ${daysAhead} ngày tới. Khoảng tối thiểu ${minGapMinutes} phút.`}
        </p>

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
