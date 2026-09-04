import { useMemo } from 'react';
import { Calendar, Filter } from 'lucide-react';
import type { Section } from '../types';

interface HeaderProps {
  section: Section;
  filter?: string;
  onFilterChange?: (v: string) => void;
  filterOptions?: { value: string; label: string }[];
}

const sectionTitles: Record<Section, string> = {
  overview: 'Overview',
  patients: 'Patients',
  appointments: 'Appointments',
  settings: 'Settings',
};

export default function Header({ section, filter, onFilterChange, filterOptions }: HeaderProps) {
  const today = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }, []);

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-surface">
      <div>
        <h1 className="text-base font-medium text-text-primary">{sectionTitles[section]}</h1>
        <p className="text-xs text-text-muted flex items-center mt-0.5">
          <Calendar className="w-3 h-3 mr-1" />
          {today}
        </p>
      </div>

      {filterOptions && onFilterChange && (
        <div className="flex items-center">
          <Filter className="w-3.5 h-3.5 text-text-muted mr-2" />
          <select
            value={filter || ''}
            onChange={e => onFilterChange(e.target.value)}
            className="text-xs bg-bg-page border border-border rounded-btn px-3 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">All</option>
            {filterOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}
    </header>
  );
}
