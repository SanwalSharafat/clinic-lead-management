import { useMemo } from 'react';
import { CalendarDays, Clock, Loader2, AlertCircle } from 'lucide-react';
import { useAppointments } from '../hooks/useAppointments';

interface Grouped {
  date: string;
  label: string;
  items: { id: string; patient_name: string; time: string; phone?: string }[];
}

export default function AppointmentsSection() {
  const { data: appointments, isLoading, isError, refetch } = useAppointments();

  const grouped: Grouped[] = useMemo(() => {
    const map = new Map<string, Grouped>();
    (appointments || []).forEach(a => {
      if (!map.has(a.date)) {
        const d = new Date(a.date);
        map.set(a.date, {
          date: a.date,
          label: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
          items: [],
        });
      }
      map.get(a.date)!.items.push({
        id: a.id,
        patient_name: a.patient_name,
        time: a.time,
        phone: a.phone,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [appointments]);

  if (isLoading) {
    return (
      <div className="px-6 pt-5 pb-6">
        <div className="bg-surface border border-border rounded-card p-6">
          <Loader2 className="w-5 h-5 text-text-muted animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-6 pt-5 pb-6">
        <div className="bg-surface border border-border rounded-card p-6 text-center">
          <AlertCircle className="w-5 h-5 text-danger mx-auto mb-2" />
          <p className="text-sm text-text-secondary">Failed to load appointments</p>
          <button onClick={() => refetch()} className="mt-3 px-3 py-1.5 text-xs font-medium rounded-btn bg-accent text-white hover:bg-accent-hover">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-5 pb-6 space-y-4">
      {grouped.length === 0 && (
        <div className="bg-surface border border-border rounded-card p-8 text-center">
          <CalendarDays className="w-6 h-6 text-text-muted mx-auto mb-2" />
          <p className="text-sm text-text-secondary">No upcoming appointments</p>
        </div>
      )}

      {grouped.map(group => (
        <div key={group.date} className="bg-surface border border-border rounded-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-bg-page/50">
            <h3 className="text-xs font-medium text-text-primary">{group.label}</h3>
          </div>
          <div className="divide-y divide-border">
            {group.items.map(item => (
              <div key={item.id} className="px-4 py-3 flex items-center">
                <div className="w-16 flex items-center text-xs text-text-secondary">
                  <Clock className="w-3 h-3 mr-1" />
                  {item.time}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">{item.patient_name}</p>
                  {item.phone && <p className="text-xs text-text-muted">{item.phone}</p>}
                </div>
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-accent-muted text-accent">
                  Booked
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
