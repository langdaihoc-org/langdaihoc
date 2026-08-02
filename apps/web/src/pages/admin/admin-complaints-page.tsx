import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type Complaint } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/brand';
import { complaintStatusLabel } from '@/lib/format';
import { useState } from 'react';
import { ComplaintThread } from '@/components/marketplace/complaint-thread';
import { QueryErrorState } from '@/components/ui/query-state';

export function AdminComplaintsPage() {
  const qc = useQueryClient();
  const { data, isError, refetch } = useQuery({ queryKey: ['admin-complaints'], queryFn: () => adminApi.complaints() });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [reply, setReply] = useState<Record<string, string>>({});

  const { data: messagesData } = useQuery({
    queryKey: ['admin-complaint-messages', expandedId],
    queryFn: () => adminApi.complaintMessages(expandedId!),
    enabled: !!expandedId,
  });

  const update = useMutation({
    mutationFn: ({ id, status, adminResolution }: { id: string; status: string; adminResolution?: string }) =>
      adminApi.updateComplaint(id, { status, adminResolution }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-complaints'] });
      if (expandedId) qc.invalidateQueries({ queryKey: ['admin-complaint-messages', expandedId] });
    },
  });

  const replyMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => adminApi.addComplaintMessage(id, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-complaint-messages', vars.id] });
      setReply((p) => ({ ...p, [vars.id]: '' }));
    },
  });

  const messages = messagesData?.data ?? [];

  if (isError) {
    return <QueryErrorState message="Không tải được khiếu nại" onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-3">
      <h1 className="font-bold">Khiếu nại</h1>
      {(data?.data ?? []).length === 0 ? (
        <Card className="py-10 text-center text-[var(--color-muted)]">Chưa có khiếu nại</Card>
      ) : (data?.data ?? []).map((c: Complaint) => (
        <Card key={c.id} className="space-y-3">
          <button
            type="button"
            className="flex w-full items-start justify-between gap-2 text-left"
            onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}
          >
            <div>
              <p className="font-semibold">{c.reason}</p>
              <p className="text-xs text-[var(--color-muted)]">{new Date(c.createdAt).toLocaleString('vi')}</p>
              {c.buyer && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Người gửi: {c.buyer.fullName} · {c.buyer.email} · {c.buyer.phone ?? '—'}
                </p>
              )}
              {c.shopName && (
                <p className="text-xs text-[var(--color-muted)]">Quán: {c.shopName}</p>
              )}
            </div>
            <StatusBadge variant={c.status === 'resolved' ? 'green' : c.status === 'rejected' ? 'red' : 'orange'}>{complaintStatusLabel(c.status)}</StatusBadge>
          </button>

          {expandedId === c.id && (
            <>
              <p className="text-sm text-[var(--color-muted)]">{c.description}</p>
              <ComplaintThread
                complaint={c}
                messages={messages}
                canReply={false}
              />
              {['new', 'processing', 'waiting_seller'].includes(c.status) && (
                <>
                  <Input
                    label="Phản hồi nhanh"
                    value={reply[c.id] ?? ''}
                    onChange={(e) => setReply({ ...reply, [c.id]: e.target.value })}
                    placeholder="Nhắn cho người mua..."
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={(reply[c.id] ?? '').trim().length < 1}
                    loading={replyMut.isPending}
                    onClick={() => replyMut.mutate({ id: c.id, body: reply[c.id]!.trim() })}
                  >
                    Gửi tin nhắn
                  </Button>
                  <Input
                    label="Kết luận (khi giải quyết)"
                    value={resolution[c.id] ?? ''}
                    onChange={(e) => setResolution({ ...resolution, [c.id]: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="green" onClick={() => update.mutate({ id: c.id, status: 'resolved', adminResolution: resolution[c.id] })}>Giải quyết</Button>
                    <Button size="sm" variant="danger" onClick={() => update.mutate({ id: c.id, status: 'rejected', adminResolution: resolution[c.id] })}>Từ chối</Button>
                  </div>
                </>
              )}
              {c.adminResolution && <p className="text-xs text-brand-green">Kết luận: {c.adminResolution}</p>}
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
