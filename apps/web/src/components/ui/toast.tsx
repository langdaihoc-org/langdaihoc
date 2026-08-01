import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++toastId;
    setItems((prev) => [...prev, { id, message, variant }]);
    // Lỗi hiển thị lâu hơn để người dùng kịp đọc
    window.setTimeout(() => dismiss(id), variant === 'error' ? 6000 : 3200);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.variant === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-[var(--shadow-hover)]',
              t.variant === 'success' && 'bg-brand-green text-white',
              t.variant === 'error' && 'bg-red-600 text-white',
              t.variant === 'info' && 'bg-[var(--color-ink)] text-white',
            )}
          >
            {t.variant === 'success' && <CheckCircle2 className="size-4 shrink-0" />}
            {t.variant === 'error' && <AlertCircle className="size-4 shrink-0" />}
            {t.variant === 'info' && <Info className="size-4 shrink-0" />}
            <span className="min-w-0 flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Đóng thông báo"
              className="-mr-1 grid size-7 shrink-0 place-items-center rounded-full hover:bg-white/15"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
