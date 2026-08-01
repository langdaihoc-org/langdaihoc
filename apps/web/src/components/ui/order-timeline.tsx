import { cn } from '@/lib/utils';
import { orderStatusLabel } from '@/lib/format';

const FOOD_STEPS = ['pending', 'accepted', 'preparing', 'delivering', 'completed'];
const SHIP_STEPS = ['pending', 'accepted', 'preparing', 'picked_up', 'delivering', 'completed'];
const LAUNDRY_STEPS = ['pending', 'accepted', 'picking_up', 'washing', 'returning', 'completed'];

export function OrderTimeline({
  type,
  status,
  compact,
}: {
  type: string;
  status: string;
  compact?: boolean;
}) {
  const steps =
    type === 'laundry' ? LAUNDRY_STEPS : type === 'ship_proxy' ? SHIP_STEPS : FOOD_STEPS;
  const current = steps.indexOf(status);

  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto pb-1',
        compact ? 'justify-start' : 'justify-between',
      )}
    >
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div
            key={s}
            className={cn(
              'flex min-w-[72px] flex-col items-center gap-1.5 text-center',
              done && 'text-brand-green',
              active && 'text-brand-orange',
              !done && !active && 'text-[var(--color-muted)]',
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold border-2 transition',
                done && 'border-brand-green bg-brand-green text-white',
                active && 'border-brand-orange bg-brand-orange text-white shadow-[0_8px_20px_rgba(255,95,22,0.25)]',
                !done && !active && 'border-[var(--color-line)] bg-white',
              )}
            >
              {i + 1}
            </span>
            <small className="text-[10px] font-extrabold leading-tight">
              {orderStatusLabel(s, type)}
            </small>
          </div>
        );
      })}
    </div>
  );
}

export function LaundryProcessTimeline() {
  const steps = [
    'Đặt lịch',
    'Có người đến lấy',
    'Đang giặt',
    'Giao lại tận nơi',
    'Hoàn tất',
  ];

  return (
    <div className="flex justify-between gap-2 overflow-x-auto">
      {steps.map((label, i) => (
        <div
          key={label}
          className={cn(
            'flex min-w-[72px] flex-col items-center gap-1.5 text-center',
            i <= 1 ? 'text-brand-green' : i === 2 ? 'text-brand-orange' : 'text-[var(--color-muted)]',
          )}
        >
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold border-2',
              i <= 1 && 'border-brand-green bg-brand-green text-white',
              i === 2 && 'border-brand-orange bg-brand-orange text-white',
              i > 2 && 'border-[var(--color-line)] bg-white',
            )}
          >
            {i + 1}
          </span>
          <small className="text-[10px] font-extrabold leading-tight">{label}</small>
        </div>
      ))}
    </div>
  );
}
