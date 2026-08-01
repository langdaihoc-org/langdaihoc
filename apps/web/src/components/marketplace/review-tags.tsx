import { cn } from '@/lib/utils';

export function ReviewTagPicker({
  tags,
  selected,
  onChange,
  max = 3,
}: {
  tags: readonly string[];
  selected: string[];
  onChange: (tags: string[]) => void;
  max?: number;
}) {
  const toggle = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
      return;
    }
    if (selected.length >= max) return;
    onChange([...selected, tag]);
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Tags (tối đa {max})</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const active = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-brand-orange bg-orange-50 text-brand-orange'
                  : 'border-[var(--color-line)] text-[var(--color-muted)] hover:border-brand-orange/40',
              )}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewTagList({ tags }: { tags?: string[] | null }) {
  if (!tags?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-brand-orange">
          {t}
        </span>
      ))}
    </div>
  );
}
