import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MessageSquarePlus } from 'lucide-react';
import { catalogApi, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';

export function SiteFeedbackForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [type, setType] = useState<'feedback' | 'bug'>('feedback');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');

  const submitMut = useMutation({
    mutationFn: () =>
      catalogApi.submitFeedback({
        type,
        message: message.trim(),
        contact: contact.trim() || undefined,
        pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      }),
    onSuccess: (res) => {
      toast(res.message || 'Đã gửi cảm ơn bạn!', 'success');
      setMessage('');
      setContact('');
      setType('feedback');
      onClose();
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không gửi được', 'error'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId={titleId}
      overlayClassName="items-center p-4"
      panelClassName="w-full max-w-md overflow-hidden rounded-3xl bg-white p-5 shadow-2xl"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">Gửi tới admin</p>
          <h2 id={titleId} className="font-bold">Góp ý / Báo lỗi</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-sm text-[var(--color-muted)] hover:bg-black/5">
          Đóng
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {([
          ['feedback', 'Góp ý'],
          ['bug', 'Báo lỗi'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setType(id)}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
              type === id
                ? id === 'bug'
                  ? 'border-amber-400 bg-amber-100 text-amber-950'
                  : 'border-brand-orange/40 bg-sky-50 text-brand-orange-dark'
                : 'border-[var(--color-line)] text-[var(--color-muted)] hover:bg-black/[0.02]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Nội dung</label>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        placeholder={type === 'bug' ? 'Mô tả lỗi bạn gặp (trang nào, làm gì thì lỗi)...' : 'Chia sẻ góp ý để cải thiện langdaihoc...'}
        className="mb-3 w-full resize-none rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-orange/50"
      />

      <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
        Liên hệ {isAuthenticated ? '(tuỳ chọn — đã có tài khoản)' : '(email hoặc SĐT, tuỳ chọn)'}
      </label>
      <Input
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder={user?.email || 'vd. email hoặc 09xx...'}
        className="mb-4"
      />

      <Button
        className="w-full"
        loading={submitMut.isPending}
        disabled={message.trim().length < 10}
        onClick={() => submitMut.mutate()}
      >
        Gửi cho admin
      </Button>
      <p className="mt-2 text-center text-[11px] text-[var(--color-muted)]">Tối thiểu 10 ký tự · Admin sẽ nhận trong trang quản trị</p>
    </Modal>
  );
}

export function SiteFeedbackTrigger({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 text-sm font-semibold text-brand-orange hover:text-brand-orange-dark',
          className,
        )}
      >
        <MessageSquarePlus className="size-3.5" />
        Góp ý / Báo lỗi
      </button>
      <SiteFeedbackForm open={open} onClose={() => setOpen(false)} />
    </>
  );
}
