import { useState } from 'react';
import type { Complaint, ComplaintMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { complaintStatusLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { sanitizeImageUrl } from '@langdaihoc/shared';

const ROLE_LABEL: Record<string, string> = {
  buyer: 'Người mua',
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
}: {
  complaint: Complaint;
  messages: ComplaintMessage[];
  onSend?: (body: string) => void | Promise<unknown>;
  sending?: boolean;
  canReply?: boolean;
  /** Role đang xem thread — dùng để gắn nhãn “Bạn” */
  viewerRole?: 'buyer' | 'seller' | 'admin';
  /** Ẩn badge khi khiếu nại còn mở (vd. seller không cần nhãn “Chờ seller”) */
  hideOpenStatus?: boolean;
}) {
  const [reply, setReply] = useState('');
  const closed = complaint.status === 'resolved' || complaint.status === 'rejected';
  const showStatus = closed || !hideOpenStatus;

  const roleLabel = (role: string) => {
    if (viewerRole && role === viewerRole) return 'Bạn';
    return ROLE_LABEL[role] ?? role;
  };

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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{complaint.reason}</p>
        {showStatus && (
          <StatusBadge variant={closed ? (complaint.status === 'resolved' ? 'green' : 'red') : 'orange'}>
            {complaintStatusLabel(complaint.status)}
          </StatusBadge>
        )}
      </div>

      {complaint.description && (
        <p className="text-sm text-[var(--color-muted)]">{complaint.description}</p>
      )}

      {complaint.evidenceUrls && complaint.evidenceUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {complaint.evidenceUrls
            .map((url) => sanitizeImageUrl(url))
            .filter((url): url is string => Boolean(url))
            .map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt="Ảnh đính kèm"
                  className="size-20 rounded-lg border border-[var(--color-line)] object-cover"
                />
              </a>
            ))}
        </div>
      )}

      <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Chưa có tin nhắn</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'rounded-xl px-3 py-2 text-sm',
                m.authorRole === 'admin'
                  ? 'ml-4 bg-blue-50'
                  : m.authorRole === 'buyer'
                    ? 'mr-4 bg-white'
                    : 'bg-orange-50',
              )}
            >
              <p className="text-[10px] font-semibold uppercase text-[var(--color-muted)]">
                {roleLabel(m.authorRole)} · {m.authorName}
              </p>
              <p className="mt-0.5">{m.body}</p>
              <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                {new Date(m.createdAt).toLocaleString('vi')}
              </p>
            </div>
          ))
        )}
      </div>

      {canReply && !closed && onSend && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Input
              placeholder="Nhắn phản hồi..."
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
            variant="outline"
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
        <p className="text-xs text-[var(--color-muted)]">Khiếu nại đã đóng — không thể nhắn thêm.</p>
      )}
    </div>
  );
}
