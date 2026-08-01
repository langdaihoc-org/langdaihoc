import { cn } from '@/lib/utils';

export function CategoryChips({
  categories,
  active,
  onChange,
}: {
  categories: { id: string; name: string; slug: string }[];
  active: string | null;
  onChange: (slug: string | null) => void;
}) {
  const chipClass = (isActive: boolean) =>
    cn(
      'shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'border-brand-orange-dark bg-brand-orange-dark text-white'
        : 'border-[var(--color-line)] bg-white text-[var(--color-ink)] hover:border-brand-orange/40',
    );

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <button type="button" onClick={() => onChange(null)} className={chipClass(active === null)}>
        Tất cả
      </button>
      {categories.map((c) => (
        <button key={c.id} type="button" onClick={() => onChange(c.slug)} className={chipClass(active === c.slug)}>
          {c.name}
        </button>
      ))}
    </div>
  );
}

export function ServiceSwitcher({
  active,
  onChange,
}: {
  active: 'food' | 'laundry';
  onChange: (v: 'food' | 'laundry') => void;
}) {
  return (
    <div className="flex rounded-full border border-[var(--color-line)] bg-white p-1">
      <button
        type="button"
        onClick={() => onChange('food')}
        className={cn(
          'flex-1 rounded-full py-2 text-sm font-medium transition-colors',
          active === 'food' ? 'bg-brand-orange-dark text-white' : 'text-[var(--color-muted)]',
        )}
      >
        Ăn uống
      </button>
      <button
        type="button"
        onClick={() => onChange('laundry')}
        className={cn(
          'flex-1 rounded-full py-2 text-sm font-medium transition-colors',
          active === 'laundry' ? 'bg-brand-green text-white' : 'text-[var(--color-muted)]',
        )}
      >
        Giặt đồ
      </button>
    </div>
  );
}
