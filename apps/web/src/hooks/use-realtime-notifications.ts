import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { loadSupabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';

/**
 * Subscribe Supabase Realtime tới bảng `notifications` theo user_id.
 * Lazy-load client — không kéo supabase-js vào bundle trang chủ.
 */
export function useRealtimeNotifications() {
  const { isAuthenticated, user } = useAuth();
  const qc = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    let cancelled = false;

    void (async () => {
      const supabase = await loadSupabase();
      if (cancelled || !supabase) return;

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
            void qc.invalidateQueries({ queryKey: ['notifications'] });
            void qc.invalidateQueries({ queryKey: ['buyer-orders-pulse'] });
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('[realtime] notifications channel error — falling back to polling');
          }
        });

      if (cancelled) {
        void supabase.removeChannel(channel);
        return;
      }
      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
        void loadSupabase().then((supabase) => {
          if (supabase) void supabase.removeChannel(ch);
        });
      }
    };
  }, [isAuthenticated, user?.id, qc]);
}
