import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SOCKET_EVENTS, type JobProgressPayload } from '@piwu/shared';
import { connectSocket } from '@/lib/socket';
import { useAuth } from '@/auth/auth-context';

export function useJobSocket(): void {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const socket = connectSocket();

    const invalidate = (payload: JobProgressPayload) => {
      void queryClient.invalidateQueries({ queryKey: ['clips'] });
      void queryClient.invalidateQueries({ queryKey: ['clips', payload.jobId] });
    };

    socket.on(SOCKET_EVENTS.JOB_PROGRESS, invalidate);
    socket.on(SOCKET_EVENTS.JOB_COMPLETED, invalidate);
    socket.on(SOCKET_EVENTS.JOB_FAILED, invalidate);

    return () => {
      socket.off(SOCKET_EVENTS.JOB_PROGRESS, invalidate);
      socket.off(SOCKET_EVENTS.JOB_COMPLETED, invalidate);
      socket.off(SOCKET_EVENTS.JOB_FAILED, invalidate);
    };
  }, [user, queryClient]);
}
