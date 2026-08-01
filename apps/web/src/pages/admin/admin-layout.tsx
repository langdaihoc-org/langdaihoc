import { Outlet } from 'react-router-dom';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { ADMIN_LINKS } from './admin-shared';

export function AdminLayout() {
  return (
    <DashboardShell title="Trung tâm quản trị" subtitle="Quản lý toàn bộ hệ thống langdaihoc" links={ADMIN_LINKS} homeTo="/admin" accent="green">
      <Outlet />
    </DashboardShell>
  );
}
