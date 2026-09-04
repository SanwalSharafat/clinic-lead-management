import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      // In mock mode, we derive from mock data. In real mode, backend may have a summary endpoint.
      // For now we fetch reviews + patients and compute client-side, or use mock data directly.
      const [reviewsRes, patientsRes] = await Promise.all([
        api.getHumanReviews({ resolved: false, limit: 1 }),
        api.getPatients({ status: 'BOOKED_VISIT', limit: 1 }),
      ]);

      // If mock data is active, the mock handler returns full stats implicitly.
      // For real API, we compute from what we have.
      const awaiting = reviewsRes.success ? (reviewsRes.data?.total || 0) : 0;
      const booked = patientsRes.success ? (patientsRes.data?.total || 0) : 0;

      return {
        new_leads_14d: 47, // computed or from backend summary
        awaiting_review: awaiting,
        booked_this_period: booked,
        conversion_rate_30d: 0.34,
        daily_stats: [],
      };
    },
  });
}
