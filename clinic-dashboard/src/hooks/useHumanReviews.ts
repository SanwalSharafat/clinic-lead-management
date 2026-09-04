import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useHumanReviews(params?: { resolved?: boolean; reason?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['human-reviews', params],
    queryFn: async () => {
      const res = await api.getHumanReviews(params);
      if (!res.success) throw new Error(res.error || 'Failed to fetch reviews');
      return res.data!;
    },
  });
}

export function useHumanReview(id: string) {
  return useQuery({
    queryKey: ['human-review', id],
    queryFn: async () => {
      const res = await api.getHumanReview(id);
      if (!res.success) throw new Error(res.error || 'Failed to fetch review');
      return res.data!;
    },
    enabled: !!id,
  });
}

export function useReviewActions() {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['human-reviews'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const approve = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { reviewer_id: string; notes?: string } }) =>
      api.approveReview(id, body),
    onSuccess: invalidate,
  });

  const correct = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { reviewer_id: string; notes?: string; corrected_fields: Record<string, string> } }) =>
      api.correctReview(id, body),
    onSuccess: invalidate,
  });

  const escalate = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { reviewer_id: string; notes?: string } }) =>
      api.escalateReview(id, body),
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { reviewer_id: string; notes: string; reason: string } }) =>
      api.rejectReview(id, body),
    onSuccess: invalidate,
  });

  return { approve, correct, escalate, reject };
}
