import { useQuery } from '@tanstack/react-query';
import { adminApi, type AuditLog } from '@/lib/api';
import { DataTable } from '@/components/layout/dashboard-shell';

export function AdminAuditPage() {
  const { data } = useQuery({ queryKey: ['admin-audit-logs'], queryFn: () => adminApi.auditLogs(50) });

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
