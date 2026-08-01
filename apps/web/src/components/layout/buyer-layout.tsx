import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/auth-context';
import { getRoleHome } from '@/lib/roles';
import { ResponsiveBuyerLayout } from '@/components/layout/responsive-layout';

function AuthSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-orange border-t-transparent" />
    </div>
  );
}

/** Blocks seller/admin from buyer UI; guests and buyers allowed. */
export function BuyerOnlyLayout() {
  const { isLoading, isAuthenticated, user } = useAuth();

  if (isLoading) return <AuthSpinner />;

  if (isAuthenticated && user && user.role !== 'buyer') {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  return <ResponsiveBuyerLayout />;
}

export function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: string[];
}) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isLoading) return <AuthSpinner />;

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  return <>{children}</>;
}

export function GuestOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();

  if (isLoading) return <AuthSpinner />;

  if (isAuthenticated && user) {
    return <Navigate to={getRoleHome(user.role)} replace />;
  }

  return <>{children}</>;
}
