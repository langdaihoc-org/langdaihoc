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
  refetch: () => void;
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

  const logout = useCallback(async () => {
    await authApi.logout();
    queryClient.clear();
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
      refetch: () => {
        void refetch();
      },
      logout,
    }),
    [user, bootstrapped, refetch, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
