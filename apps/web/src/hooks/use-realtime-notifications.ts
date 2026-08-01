import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';

/**
 * Subscribe Supabase Realtime tới bảng `notifications` theo user_id.
 * Khi có INSERT/UPDATE → invalidate ['notifications'] để bell icon + list
 * cập nhật ngay, không cần đợi poll.
 *
 * Fallback an toàn: nếu `supabase` null (env chưa cấu hình) thì bỏ qua.
 */
export function useRealtimeNotifications() {
  const { isAuthenticated, user } = useAuth();
  const qc = useQueryClient();
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.id || !supabase) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Có thay đổi → invalidate để refetch ngay
          void qc.invalidateQueries({ queryKey: ['notifications'] });
          // Cũng cập nhật pulse để badge và poll interval biết ngay
          void qc.invalidateQueries({ queryKey: ['buyer-orders-pulse'] });
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[realtime] notifications channel error — falling back to polling');
        }
      });

    channelRef.current = channel;

    return () => {
      void channel.unsubscribe();
      channelRef.current = null;
    };
  }, [isAuthenticated, user?.id, qc]);
}
