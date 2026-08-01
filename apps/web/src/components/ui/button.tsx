import { type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'green' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2',
        size === 'sm' && 'h-9 min-h-9 px-3.5 text-xs',
        size === 'md' && 'h-10 min-h-10 px-5 text-sm',
        size === 'lg' && 'h-11 min-h-11 px-6 text-sm',
        size === 'icon' && 'size-11 min-h-11 min-w-11 p-0',
        variant === 'primary' && 'bg-brand-orange-dark text-white hover:bg-[#072a4d] shadow-sm shadow-sky-500/20',
        variant === 'green' && 'bg-brand-green text-white hover:bg-brand-green-dark shadow-sm shadow-cyan-500/15',
        variant === 'secondary' && 'bg-sky-50 text-brand-orange-dark hover:bg-sky-100',
        variant === 'danger' && 'bg-red-50 text-red-700 hover:bg-red-100',
        variant === 'outline' && 'border border-[var(--color-line)] bg-white text-[var(--color-ink)] hover:border-brand-orange/50 hover:text-brand-orange-dark',
        variant === 'ghost' && 'text-[var(--color-muted)] hover:bg-sky-50/80 hover:text-[var(--color-ink)]',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Đang xử lý...' : children}
    </button>
  );
}
