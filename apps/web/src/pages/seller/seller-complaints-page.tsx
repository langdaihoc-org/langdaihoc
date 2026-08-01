import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sellerApi, ApiError, type Complaint } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { complaintStatusLabel } from '@/lib/format';
import { StatusBadge } from '@/components/ui/brand';
import { useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { ComplaintThread } from '@/components/marketplace/complaint-thread';

export function SellerComplaintsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['seller-complaints'], queryFn: () => sellerApi.complaints() });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: messagesData } = useQuery({
    queryKey: ['seller-complaint-messages', expandedId],
    queryFn: () => sellerApi.complaintMessages(expandedId!),
    enabled: !!expandedId,
  });
  const replyMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => sellerApi.addComplaintMessage(id, body),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['seller-complaint-messages', vars.id] });
      qc.invalidateQueries({ queryKey: ['seller-complaints'] });
      toast('Đã gửi phản hồi', 'success');
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Không gửi được tin nhắn', 'error'),
  });
  const list = data?.data ?? [];

  return (
    <div className="space-y-3">
      <h1 className="font-bold">Khiếu nại từ khách</h1>
      {isLoading ? (
        <Card className="py-10 text-center text-sm text-[var(--color-muted)]">Đang tải...</Card>
      ) : list.length === 0 ? (
        <Card className="py-10 text-center text-[var(--color-muted)]">Chưa có khiếu nại</Card>
      ) : list.map((c: Complaint) => (
        <Card key={c.id} className="space-y-3">
          <button type="button" className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}>
            <div>
              <p className="font-semibold">{c.reason}</p>
              {c.buyer && (
                <p className="text-xs text-[var(--color-muted)]">
                  {c.buyer.fullName} · {c.buyer.email} · {c.buyer.phone ?? '—'}
                </p>
              )}
            </div>
            <StatusBadge variant={c.status === 'resolved' ? 'green' : c.status === 'rejected' ? 'red' : 'orange'}>{complaintStatusLabel(c.status)}</StatusBadge>
          </button>
          {expandedId === c.id && (
            <ComplaintThread
              complaint={c}
              messages={messagesData?.data ?? []}
              viewerRole="seller"
              sending={replyMut.isPending}
              onSend={(body) => replyMut.mutateAsync({ id: c.id, body })}
            />
          )}
        </Card>
      ))}
    </div>
  );
}
