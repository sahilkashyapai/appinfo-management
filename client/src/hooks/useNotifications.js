import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import api from '../api/client';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data.items),
    refetchInterval: 60000,
  });
}

export function useNotificationActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: invalidate,
  });
  const clearAll = useMutation({
    mutationFn: () => api.delete('/notifications/clear-all'),
    onSuccess: invalidate,
  });

  return { markRead, markAllRead, clearAll };
}
