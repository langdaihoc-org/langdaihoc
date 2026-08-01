import { type InputHTMLAttributes, forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, type, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? props.name ?? autoId;
    const errorId = `${inputId}-error`;
    const isPassword = type === 'password';
    const [showPassword, setShowPassword] = useState(false);
    const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            {...props}
            ref={ref}
            id={inputId}
            type={resolvedType}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              'w-full rounded-sm border border-[var(--color-line)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-orange focus-visible:ring-2 focus-visible:ring-brand-orange/40',
              isPassword && 'pr-11',
              error && 'border-red-400 focus:border-red-400 focus-visible:ring-red-200',
              className,
            )}
          />
          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          )}
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
