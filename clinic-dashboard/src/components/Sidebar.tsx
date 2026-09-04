import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, CalendarDays, Settings, Sun, Moon,
  Stethoscope, ChevronRight,
} from 'lucide-react';
import type { Section } from '../types';

interface SidebarProps {
  active: Section;
  onNavigate: (s: Section) => void;
}

const navItems: { key: Section; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'patients', label: 'Patients', icon: Users },
  { key: 'appointments', label: 'Appointments', icon: CalendarDays },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ active, onNavigate }: SidebarProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem('clinic-theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('clinic-theme', next);
  };

  return (
    <aside className="w-[200px] min-h-screen bg-surface border-r border-border flex flex-col fixed left-0 top-0 z-20">
      <div className="h-14 flex items-center px-4 border-b border-border">
        <Stethoscope className="w-5 h-5 text-accent mr-2" />
        <span className="font-medium text-text-primary text-sm">ClinicOS</span>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navItems.map(item => {
          const isActive = active === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`
                w-full flex items-center px-3 py-2 rounded-btn text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-secondary hover:bg-bg-page hover:text-text-primary'}
              `}
            >
              <Icon className="w-4 h-4 mr-2.5" />
              {item.label}
              {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-60" />}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-7 h-7 rounded-full bg-accent-muted flex items-center justify-center text-accent text-xs font-medium">
              JD
            </div>
            <span className="ml-2 text-xs text-text-secondary">Dr. Jane Doe</span>
          </div>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-btn text-text-muted hover:text-text-primary hover:bg-bg-page transition-colors"
            title="Toggle theme"
          >
            {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
