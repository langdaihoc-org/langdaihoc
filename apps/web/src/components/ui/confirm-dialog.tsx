import { useId } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  variant = 'warning',
  loading,
  onConfirm,
  onCancel,
  reasonRequired,
  reasonLabel = 'Lý do',
  reasonPlaceholder = 'Nhập lý do…',
  reasonValue,
  onReasonChange,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'warning' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  reasonRequired?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonValue?: string;
  onReasonChange?: (value: string) => void;
}) {
  const titleId = useId();
  const descId = useId();
  const reasonId = useId();
  const reasonOk = !reasonRequired || Boolean(reasonValue?.trim());

  return (
    <Modal
      open={open}
      onClose={onCancel}
      role="alertdialog"
      titleId={titleId}
      describedById={description ? descId : undefined}
      zIndexClass="z-[110]"
      panelClassName="w-full max-w-sm rounded-2xl bg-white p-5 shadow-[var(--shadow-hover)]"
    >
      <div
        className={cn(
          'mb-3 flex size-11 items-center justify-center rounded-full text-xl',
          variant === 'danger' ? 'bg-red-50' : 'bg-amber-50',
        )}
        aria-hidden
      >
        {variant === 'danger' ? '!' : '!'}
      </div>
      <h2 id={titleId} className="text-lg font-bold">
        {title}
      </h2>
      {description && (
        <p id={descId} className="mt-2 text-sm text-[var(--color-muted)]">
          {description}
        </p>
      )}
      {reasonRequired && (
        <div className="mt-3">
          <label htmlFor={reasonId} className="mb-1 block text-sm font-medium">
            {reasonLabel} <span className="text-red-600">*</span>
          </label>
          <textarea
            id={reasonId}
            rows={3}
            value={reasonValue ?? ''}
            onChange={(e) => onReasonChange?.(e.target.value)}
            placeholder={reasonPlaceholder}
            className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20"
          />
        </div>
      )}
      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          className="flex-1"
          variant={variant === 'danger' ? 'danger' : 'primary'}
          loading={loading}
          disabled={!reasonOk}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
