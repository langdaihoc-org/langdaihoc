import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Overlay chuẩn: Escape, focus trap, restore focus, khóa scroll body.
 * Render qua portal → document.body để không bị cắt bởi overflow/transform của layout.
 */
export function Modal({
  open,
  onClose,
  titleId,
  describedById,
  role = 'dialog',
  zIndexClass = 'z-[80]',
  overlayClassName,
  panelClassName,
  children,
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  titleId?: string;
  describedById?: string;
  role?: 'dialog' | 'alertdialog';
  zIndexClass?: string;
  /** Ghi đè căn overlay (mặc định: đáy trên mobile, giữa từ sm). */
  overlayClassName?: string;
  panelClassName?: string;
  children: ReactNode;
  closeOnBackdrop?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const autoTitleId = useId();
  const labelledBy = titleId ?? autoTitleId;

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = getFocusable(panel);
      (nodes[0] ?? panel).focus();
    }, 0);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = getFocusable(panelRef.current);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className={cn('fixed inset-0 flex items-end justify-center sm:items-center sm:p-4', zIndexClass, overlayClassName)}>
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Đóng"
        tabIndex={-1}
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedById}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn('relative z-10 outline-none', panelClassName)}
      >
        {!titleId && <span id={autoTitleId} className="sr-only">Hộp thoại</span>}
        {children}
      </div>
    </div>,
    document.body,
  );
}
