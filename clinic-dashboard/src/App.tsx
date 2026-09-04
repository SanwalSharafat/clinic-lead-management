import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StatCards from './components/StatCards';
import LeadsTrendChart from './components/LeadsTrendChart';
import ReviewQueue from './components/ReviewQueue';
import ReviewDetail from './components/ReviewDetail';
import PatientsSection from './components/PatientsSection';
import AppointmentsSection from './components/AppointmentsSection';
import SettingsSection from './components/SettingsSection';
import type { Section, HumanReview } from './types';

export default function App() {
  const [section, setSection] = useState<Section>('overview');
  const [selectedReview, setSelectedReview] = useState<HumanReview | null>(null);

  return (
    <div className="flex min-h-screen bg-bg-page">
      <Sidebar active={section} onNavigate={setSection} />
      <main className="flex-1 ml-[200px]">
        <Header section={section} />

        {section === 'overview' && (
          <>
            <StatCards />
            <LeadsTrendChart />
            <ReviewQueue onSelect={setSelectedReview} />
          </>
        )}

        {section === 'patients' && <PatientsSection />}
        {section === 'appointments' && <AppointmentsSection />}
        {section === 'settings' && <SettingsSection />}

        {selectedReview && (
          <ReviewDetail
            reviewId={selectedReview.id}
            onClose={() => setSelectedReview(null)}
          />
        )}
      </main>
    </div>
  );
}
