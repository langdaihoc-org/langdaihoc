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
}) {
  const titleId = useId();
  const descId = useId();

  return (
    <Modal
      open={open}
      onClose={onCancel}
      role="alertdialog"
      titleId={titleId}
      describedById={description ? descId : undefined}
      zIndexClass="z-[90]"
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
      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          className="flex-1"
          variant={variant === 'danger' ? 'danger' : 'primary'}
          loading={loading}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
