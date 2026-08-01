import { cn } from '@/lib/utils';
import { getFoodImage, getLaundryImage } from '@/lib/format';

export function FoodImage({
  src,
  index = 0,
  alt,
  className,
  type = 'food',
}: {
  src?: string | null;
  index?: number;
  alt: string;
  className?: string;
  type?: 'food' | 'laundry';
}) {
  const fallback = type === 'food' ? getFoodImage(index) : getLaundryImage(index);
  return (
    <img
      src={src || fallback}
      alt={alt}
      className={cn('h-full w-full object-cover', className)}
      onError={(e) => {
        (e.target as HTMLImageElement).src = fallback;
      }}
    />
  );
}

export function StoreAvatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('rounded-sm object-cover', className)}
      />
    );
  }
  return (
    <div
      className={cn(
        'grid place-items-center rounded-sm bg-orange-50 text-lg font-bold text-brand-orange',
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
