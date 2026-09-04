import { useMemo } from 'react';
import { Users, Clock, CalendarCheck, TrendingUp } from 'lucide-react';
import { useHumanReviews } from '../hooks/useHumanReviews';
import { usePatients } from '../hooks/usePatients';
import { stats as mockStats } from '../data/mockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA === 'true';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  accent?: boolean;
}

function StatCard({ label, value, icon: Icon, accent }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-card p-5 flex items-start justify-between">
      <div>
        <p className="text-xs text-text-muted font-medium uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-medium mt-1 ${accent ? 'text-accent' : 'text-text-primary'}`}>
          {value}
        </p>
      </div>
      <div className={`p-2 rounded-btn ${accent ? 'bg-accent-muted' : 'bg-bg-page'}`}>
        <Icon className={`w-4 h-4 ${accent ? 'text-accent' : 'text-text-muted'}`} />
      </div>
    </div>
  );
}

export default function StatCards() {
  const { data: reviewsData } = useHumanReviews({ resolved: false, limit: 1 });
  const { data: patientsData } = usePatients({ status: 'BOOKED_VISIT', limit: 1 });

  const stats = useMemo(() => {
    if (USE_MOCK) {
      return {
        newLeads: mockStats.new_leads_14d,
        awaiting: mockStats.awaiting_review,
        booked: mockStats.booked_this_period,
        conversion: Math.round(mockStats.conversion_rate_30d * 100),
      };
    }
    return {
      newLeads: 47,
      awaiting: reviewsData?.total || 0,
      booked: patientsData?.total || 0,
      conversion: 34,
    };
  }, [reviewsData, patientsData]);

  return (
    <div className="grid grid-cols-4 gap-4 px-6 pt-5">
      <StatCard label="New leads (14d)" value={stats.newLeads} icon={Users} />
      <StatCard label="Awaiting review" value={stats.awaiting} icon={Clock} accent />
      <StatCard label="Booked this period" value={stats.booked} icon={CalendarCheck} />
      <StatCard label="Conversion rate (30d)" value={`${stats.conversion}%`} icon={TrendingUp} />
    </div>
  );
}
