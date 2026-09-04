import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { stats as mockStats } from '../data/mockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA === 'true';

interface ChartRow {
  date: string;
  label: string;
  total: number;
  booked: number;
}

export default function LeadsTrendChart() {
  const data: ChartRow[] = useMemo(() => {
    const source = USE_MOCK ? mockStats.daily_stats : [];
    return source.map(d => {
      const date = new Date(d.date);
      return {
        date: d.date,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        total: d.total_leads,
        booked: d.booked,
      };
    });
  }, []);

  if (!USE_MOCK || data.length === 0) {
    return (
      <div className="mx-6 mt-5 bg-surface border border-border rounded-card p-5">
        <h3 className="text-sm font-medium text-text-primary mb-4">Leads trend (14 days)</h3>
        <div className="h-48 flex items-center justify-center text-text-muted text-sm">
          Chart data available in mock mode or when backend provides daily stats
        </div>
      </div>
    );
  }

  return (
    <div className="mx-6 mt-5 bg-surface border border-border rounded-card p-5">
      <h3 className="text-sm font-medium text-text-primary mb-4">Leads trend (14 days)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-border)' }}
            interval={3}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--color-text-primary)',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingBottom: '8px' }}
            iconType="circle"
            iconSize={8}
          />
          <Bar dataKey="total" name="New leads" fill="var(--color-accent)" radius={[4, 4, 0, 0]} barSize={16} />
          <Bar dataKey="booked" name="Booked" fill="var(--color-neutral-chart)" radius={[4, 4, 0, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
