import { useQuery } from '@tanstack/react-query';
import { adminApi, type AuditLog } from '@/lib/api';
import { DataTable } from '@/components/layout/dashboard-shell';
import { QueryErrorState } from '@/components/ui/query-state';

export function AdminAuditPage() {
  const { data, isError, refetch } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => adminApi.auditLogs(50),
  });

  if (isError) {
    return <QueryErrorState message="Không tải được nhật ký" onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-3">
      <h1 className="font-bold">Nhật ký hệ thống</h1>
      <DataTable
        headers={['Thời gian', 'Hành động', 'Đối tượng', 'Người thực hiện']}
        rows={(data?.data ?? []).map((log: AuditLog) => [
          new Date(log.createdAt).toLocaleString('vi'),
          log.action,
          `${log.entityType}${log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ''}`,
          log.actorName ?? log.actorRole ?? '—',
        ])}
      />
    </div>
  );
}
