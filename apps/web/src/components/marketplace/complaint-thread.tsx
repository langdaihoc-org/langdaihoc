import { useEffect, useRef, useState } from 'react';
import type { Complaint, ComplaintMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { complaintStatusLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { sanitizeImageUrl } from '@langdaihoc/shared';

const ROLE_LABEL: Record<string, string> = {
  buyer: 'Khách',
  admin: 'Admin',
  seller: 'Người bán',
};

export function ComplaintThread({
  complaint,
  messages,
  onSend,
  sending,
  canReply = true,
  viewerRole,
  hideOpenStatus = false,
  compactHeader = false,
}: {
  complaint: Complaint;
  messages: ComplaintMessage[];
  onSend?: (body: string) => void | Promise<unknown>;
  sending?: boolean;
  canReply?: boolean;
  /** Role đang xem thread — dùng để gắn nhãn “Bạn” và căn bong bóng */
  viewerRole?: 'buyer' | 'seller' | 'admin';
  /** Ẩn badge khi khiếu nại còn mở */
  hideOpenStatus?: boolean;
  /** Ẩn title/reason trùng với header modal bên ngoài */
  compactHeader?: boolean;
}) {
  const [reply, setReply] = useState('');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const closed = complaint.status === 'resolved' || complaint.status === 'rejected';
  const showStatus = !compactHeader && (closed || !hideOpenStatus);

  const roleLabel = (role: string) => {
    if (viewerRole && role === viewerRole) return 'Bạn';
    return ROLE_LABEL[role] ?? role;
  };

  const isMine = (role: string) => Boolean(viewerRole && role === viewerRole);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, complaint.id]);

  const submit = async () => {
    const body = reply.trim();
    if (!body || !onSend || sending) return;
    try {
      await onSend(body);
      setReply('');
    } catch {
      // Parent handles toast; keep draft so user can retry
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {!compactHeader && (
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">{complaint.reason}</p>
          {showStatus && (
            <StatusBadge variant={closed ? (complaint.status === 'resolved' ? 'green' : 'red') : 'orange'}>
              {complaintStatusLabel(complaint.status)}
            </StatusBadge>
          )}
        </div>
      )}

      {(complaint.description || (complaint.evidenceUrls && complaint.evidenceUrls.length > 0)) && (
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2">
          {complaint.description && (
            <p className="text-xs text-[var(--color-muted)]">
              <span className="font-semibold text-[var(--color-ink)]">Nội dung khiếu nại: </span>
              {complaint.description}
            </p>
          )}
          {complaint.evidenceUrls && complaint.evidenceUrls.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {complaint.evidenceUrls
                .map((url) => sanitizeImageUrl(url))
                .filter((url): url is string => Boolean(url))
                .map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt="Ảnh đính kèm"
                      className="size-16 rounded-lg border border-[var(--color-line)] object-cover"
                    />
                  </a>
                ))}
            </div>
          )}
        </div>
      )}

      <div
        ref={scrollerRef}
        className="min-h-[12rem] flex-1 space-y-2 overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[#f3f7fb] p-3"
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">Chưa có tin nhắn — hãy bắt đầu hội thoại.</p>
        ) : (
          messages.map((m) => {
            const mine = isMine(m.authorRole);
            const admin = m.authorRole === 'admin';
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                    mine
                      ? 'rounded-br-md bg-brand-orange text-white'
                      : admin
                        ? 'rounded-bl-md border border-sky-200 bg-sky-50 text-[var(--color-ink)]'
                        : 'rounded-bl-md bg-white text-[var(--color-ink)]',
                  )}
                >
                  <p
                    className={cn(
                      'text-[10px] font-semibold uppercase tracking-wide',
                      mine ? 'text-white/75' : 'text-[var(--color-muted)]',
                    )}
                  >
                    {roleLabel(m.authorRole)}
                    {!mine && m.authorName ? ` · ${m.authorName}` : ''}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn('mt-1 text-[10px]', mine ? 'text-white/70' : 'text-[var(--color-muted)]')}>
                    {new Date(m.createdAt).toLocaleString('vi')}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {canReply && !closed && onSend && (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              placeholder={viewerRole === 'seller' ? 'Nhắn cho khách...' : 'Nhắn phản hồi...'}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            loading={sending}
            disabled={reply.trim().length < 1}
            onClick={() => void submit()}
          >
            Gửi
          </Button>
        </div>
      )}

      {canReply && closed && (
        <p className="rounded-xl bg-black/[0.03] px-3 py-2 text-center text-xs text-[var(--color-muted)]">
          Khiếu nại đã đóng — không thể nhắn thêm.
        </p>
      )}
    </div>
  );
}
