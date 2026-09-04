import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function usePatients(params?: { status?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: async () => {
      const res = await api.getPatients(params);
      if (!res.success) throw new Error(res.error || 'Failed to fetch patients');
      return res.data!;
    },
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: ['patient', id],
    queryFn: async () => {
      const res = await api.getPatient(id);
      if (!res.success) throw new Error(res.error || 'Failed to fetch patient');
      return res.data!;
    },
    enabled: !!id,
  });
}

export function usePatientActions() {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['patients'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const markWon = useMutation({
    mutationFn: (id: string) => api.markPatientWon(id),
    onSuccess: invalidate,
  });

  const markLost = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.markPatientLost(id, { reason }),
    onSuccess: invalidate,
  });

  return { markWon, markLost };
}
