import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, ApiError, type AuthUser } from '@/lib/api';
import { DEMO_MODE } from '@langdaihoc/shared';

export type { AuthUser };

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isActiveBuyer: boolean;
  refetch: () => Promise<unknown>;
  setSessionUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [bootstrapped, setBootstrapped] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: (count, err) => {
      if (err instanceof ApiError && err.status === 401) return false;
      return count < 1;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isLoading) setBootstrapped(true);
  }, [isLoading]);

  const user = data?.user ?? null;

  const setSessionUser = useCallback(
    (next: AuthUser | null) => {
      queryClient.setQueryData(['auth', 'me'], next ? { user: next } : null);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    // Xóa cache local trước — tránh PII còn lại nếu logout API fail/treo.
    queryClient.setQueryData(['auth', 'me'], null);
    queryClient.removeQueries({
      predicate: (q) => {
        const key = q.queryKey[0];
        return key !== 'catalog' && key !== 'auth';
      },
    });
    try {
      await authApi.logout();
    } catch {
      // đã clear session local
    }
    queryClient.removeQueries({ queryKey: ['auth'] });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: !bootstrapped,
      isAuthenticated: Boolean(user),
      isActiveBuyer: Boolean(
        user?.role === 'buyer' &&
          user.status === 'active' &&
          (user.emailVerified || DEMO_MODE),
      ),
      refetch: () => refetch(),
      setSessionUser,
      logout,
    }),
    [user, bootstrapped, refetch, setSessionUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
