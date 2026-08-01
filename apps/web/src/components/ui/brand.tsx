import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function BrandLogo({ showSlogan = false, className, to = '/' }: { showSlogan?: boolean; className?: string; to?: string }) {
  return (
    <Link to={to} className={cn('flex items-center gap-2.5 shrink-0', className)}>
      <img
        src="/langdaihoc-logo-mark.png"
        alt="Làng Đại học"
        className="h-9 w-auto shrink-0 object-contain sm:h-10"
      />
      <span className="leading-tight">
        <span className="block text-lg font-bold tracking-tight lowercase text-brand-orange-dark">
          lang<span className="text-brand-orange">daihoc</span>
        </span>
        {showSlogan && (
          <span className="block text-xs text-[var(--color-muted)]">Ăn uống · Giặt đồ · Ship hộ</span>
        )}
      </span>
    </Link>
  );
}

export function StatusBadge({
  children,
  variant = 'orange',
}: {
  children: React.ReactNode;
  variant?: 'orange' | 'green' | 'gray' | 'red';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variant === 'orange' && 'bg-sky-50 text-brand-orange-dark',
        variant === 'green' && 'bg-cyan-50 text-brand-green',
        variant === 'gray' && 'bg-gray-100 text-gray-500',
        variant === 'red' && 'bg-red-50 text-red-500',
      )}
    >
      {children}
    </span>
  );
}
