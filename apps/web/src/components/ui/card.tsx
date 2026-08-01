import { cn } from '@/lib/utils';

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('panel p-4', className)}>{children}</div>;
}

export function Alert({ children, variant = 'info', className }: { children: React.ReactNode; variant?: 'info' | 'success' | 'error' | 'warning'; className?: string }) {
  return (
    <div className={cn(
      'rounded-xl border px-4 py-3 text-sm',
      variant === 'info' && 'border-blue-100 bg-blue-50 text-blue-800',
      variant === 'success' && 'border-green-100 bg-green-50 text-brand-green-dark',
      variant === 'error' && 'border-red-100 bg-red-50 text-red-700',
      variant === 'warning' && 'border-amber-100 bg-amber-50 text-amber-800',
      className,
    )}>{children}</div>
  );
}

export function EmptyState({ icon = '📭', title, description, action }: { icon?: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="panel py-16 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
