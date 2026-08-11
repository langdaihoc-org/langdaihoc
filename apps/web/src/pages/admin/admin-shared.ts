import {
  LayoutDashboard,
  Store,
  Users,
  FolderTree,
  ScrollText,
  Image,
  Newspaper,
  Package,
  AlertTriangle,
  MessageSquarePlus,
  User,
} from 'lucide-react';
import type { DashboardLink } from '@/components/layout/dashboard-shell';

export const ROLE_LABEL: Record<string, string> = {
  buyer: 'Người mua',
  seller: 'Đối tác',
  admin: 'Quản trị',
};

export const USER_STATUS_LABEL: Record<string, string> = {
  active: 'Hoạt động',
  suspended: 'Đã khóa',
  deleted: 'Đã xóa',
  pending_email_verification: 'Chờ xác minh email',
};

export const ADMIN_LINKS: DashboardLink[] = [
  { to: '/admin', label: 'Tổng quan', Icon: LayoutDashboard },
  { to: '/admin/sellers', label: 'Quản lý đối tác', Icon: Store },
  { to: '/admin/users', label: 'Quản lý người dùng', Icon: Users },
  { to: '/admin/categories', label: 'Danh mục', Icon: FolderTree },
  { to: '/admin/audit', label: 'Nhật ký', Icon: ScrollText },
  { to: '/admin/banners', label: 'Banner', Icon: Image },
  { to: '/admin/posts', label: 'Bài đăng', Icon: Newspaper },
  { to: '/admin/orders', label: 'Đơn hàng', Icon: Package },
  { to: '/admin/complaints', label: 'Khiếu nại', Icon: AlertTriangle },
  { to: '/admin/feedback', label: 'Góp ý', Icon: MessageSquarePlus },
  { to: '/admin/profile', label: 'Hồ sơ của tôi', Icon: User },
];
