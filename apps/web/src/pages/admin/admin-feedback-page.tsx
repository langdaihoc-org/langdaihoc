import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type SiteFeedback } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/brand';
import { QueryErrorState } from '@/components/ui/query-state';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  new: 'Mới',
  read: 'Đã xem',
  done: 'Xong',
};

export function AdminFeedbackPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-feedback'],
    queryFn: () => adminApi.feedback(),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'new' | 'read' | 'done' }) =>
      adminApi.updateFeedback(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-feedback'] }),
  });

  const list = data?.data ?? [];

  if (isError) {
    return <QueryErrorState message="Không tải được góp ý" onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-bold">Góp ý / Báo lỗi</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">Tin từ chân trang gửi tới admin</p>
      </div>
      {isLoading ? (
        <Card className="py-10 text-center text-sm text-[var(--color-muted)]">Đang tải...</Card>
      ) : list.length === 0 ? (
        <Card className="py-10 text-center text-[var(--color-muted)]">Chưa có góp ý</Card>
      ) : (
        list.map((f: SiteFeedback) => {
          const isBug = f.type === 'bug';
          return (
            <Card
              key={f.id}
              className={cn(
                'space-y-2',
                f.status === 'new' && (isBug ? 'ring-1 ring-amber-300' : 'ring-1 ring-sky-200'),
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge variant={isBug ? 'orange' : 'green'}>
                    {isBug ? 'Báo lỗi' : 'Góp ý'}
                  </StatusBadge>
                  <StatusBadge variant={f.status === 'done' ? 'green' : f.status === 'read' ? 'orange' : 'red'}>
                    {STATUS_LABEL[f.status] ?? f.status}
                  </StatusBadge>
                </div>
                <p className="text-[11px] text-[var(--color-muted)]">{new Date(f.createdAt).toLocaleString('vi')}</p>
              </div>
              <p className="whitespace-pre-wrap text-sm">{f.message}</p>
              <div className="space-y-0.5 text-xs text-[var(--color-muted)]">
                {(f.contact || f.userEmail) && (
                  <p>Liên hệ: {f.contact || f.userEmail}{f.userName ? ` · ${f.userName}` : ''}</p>
                )}
                {f.pageUrl && (
                  <p className="truncate">
                    Trang:{' '}
                    <a href={f.pageUrl} target="_blank" rel="noreferrer" className="text-brand-orange hover:underline">
                      {f.pageUrl}
                    </a>
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {f.status === 'new' && (
                  <Button size="sm" variant="outline" loading={updateMut.isPending} onClick={() => updateMut.mutate({ id: f.id, status: 'read' })}>
                    Đã xem
                  </Button>
                )}
                {f.status !== 'done' && (
                  <Button size="sm" variant="green" loading={updateMut.isPending} onClick={() => updateMut.mutate({ id: f.id, status: 'done' })}>
                    Xong
                  </Button>
                )}
                {f.status === 'done' && (
                  <Button size="sm" variant="ghost" loading={updateMut.isPending} onClick={() => updateMut.mutate({ id: f.id, status: 'new' })}>
                    Mở lại
                  </Button>
                )}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
