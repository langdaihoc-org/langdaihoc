import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

const ITEM_HEIGHT = 40;

interface WheelColumnProps {
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel: string;
}

export function WheelColumn({ items, value, onChange, className, ariaLabel }: WheelColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProgrammatic = useRef(false);

  const selectedIndex = Math.max(0, items.findIndex((i) => i.value === value));

  const scrollToIndex = useCallback((index: number, smooth = true) => {
    const el = ref.current;
    if (!el) return;
    isProgrammatic.current = true;
    el.scrollTo({ top: index * ITEM_HEIGHT, behavior: smooth ? 'smooth' : 'auto' });
    window.setTimeout(() => { isProgrammatic.current = false; }, 300);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const current = Math.round(el.scrollTop / ITEM_HEIGHT);
    if (current !== selectedIndex) scrollToIndex(selectedIndex, false);
  }, [selectedIndex, scrollToIndex]);

  const handleScroll = () => {
    const el = ref.current;
    if (!el || isProgrammatic.current) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const index = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT)));
      scrollToIndex(index);
      const next = items[index];
      if (next && next.value !== value) onChange(next.value);
    }, 110);
  };

  return (
    <div className={cn('relative h-[200px] flex-1', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-10 -translate-y-1/2 rounded-xl bg-black/5" />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-white via-transparent to-white" />
      <div
        ref={ref}
        role="listbox"
        aria-label={ariaLabel}
        tabIndex={0}
        onScroll={handleScroll}
        className="no-scrollbar relative z-0 h-full snap-y snap-mandatory overflow-y-scroll"
        style={{ paddingBlock: ITEM_HEIGHT * 2 }}
      >
        {items.map((item, i) => {
          const active = i === selectedIndex;
          return (
            <button
              type="button"
              key={item.value}
              role="option"
              aria-selected={active}
              onClick={() => { scrollToIndex(i); onChange(item.value); }}
              className={cn(
                'flex h-10 w-full snap-center items-center justify-center text-base tabular-nums transition-all',
                active ? 'font-semibold text-[var(--color-ink)]' : 'text-[var(--color-muted)]/60',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
