import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useAppointments() {
  return useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      // Fetch booked patients and treat them as appointments
      const res = await api.getPatients({ status: 'BOOKED_VISIT', limit: 100 });
      if (!res.success) throw new Error(res.error || 'Failed to fetch appointments');
      return res.data!.patients.map(p => ({
        id: p.id,
        patient_id: p.id,
        patient_name: p.name,
        date: p.last_updated.split('T')[0],
        time: '09:00', // placeholder — backend should provide real time
        status: p.status,
        phone: p.phone,
      }));
    },
  });
}
