import type {
  HumanReview, Patient, Appointment, DashboardStats,
  ApiResponse, Message, ScoreBreakdownItem, ExtractedField,
} from '../types';

const now = new Date();
const fmt = (d: Date) => d.toISOString();
const daysAgo = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return fmt(d); };

const sampleMessages: Message[] = [
  { id: 'm1', role: 'user', content: 'Hi, I\'m looking to book a consultation for dental implants. I\'ve been missing two upper molars for about 6 months.', created_at: daysAgo(2) },
  { id: 'm2', role: 'assistant', content: 'Thank you for reaching out! I\'d be happy to help you with dental implants. To better assist you, could you tell me if you\'re experiencing any pain or discomfort in that area?', created_at: daysAgo(2) },
  { id: 'm3', role: 'user', content: 'No pain really, but I\'m worried about bone loss. I\'m 54 and in good health otherwise.', created_at: daysAgo(2) },
  { id: 'm4', role: 'assistant', content: 'That\'s a very valid concern. Bone preservation is important. Do you have any existing medical conditions we should be aware of, such as diabetes or osteoporosis?', created_at: daysAgo(2) },
  { id: 'm5', role: 'user', content: 'No diabetes. I take blood pressure medication but it\'s well controlled. No osteoporosis that I know of.', created_at: daysAgo(1) },
];

const sampleExtracted: ExtractedField[] = [
  { key: 'Procedure Interest', value: 'Dental Implants', confidence: 0.96 },
  { key: 'Missing Teeth', value: '2 upper molars', confidence: 0.91 },
  { key: 'Duration', value: '6 months', confidence: 0.88 },
  { key: 'Age', value: '54', confidence: 0.95 },
  { key: 'Pain Level', value: 'None', confidence: 0.85 },
  { key: 'Medical Conditions', value: 'Hypertension (controlled)', confidence: 0.82 },
];

const sampleBreakdown: ScoreBreakdownItem[] = [
  { rule: 'Procedure specificity', points: 25, description: 'Patient named exact procedure' },
  { rule: 'Timeline clarity', points: 15, description: 'Clear duration mentioned' },
  { rule: 'Health disclosure', points: 20, description: 'Shared relevant medical history' },
  { rule: 'Pain absence', points: 10, description: 'No acute pain (elective case)' },
  { rule: 'Age factor', points: 8, description: 'Middle-aged, good candidate' },
];

const makeReview = (id: number, overrides?: Partial<HumanReview>): HumanReview => ({
  id: `hr-${id}`,
  patient_id: `p-${id}`,
  patient_name: [
    'Sarah Mitchell', 'James Rodriguez', 'Emily Chen', 'Michael Thompson',
    'Lisa Park', 'David Kim', 'Anna Williams', 'Robert Johnson',
    'Jessica Lee', 'Christopher Brown', 'Amanda Davis', 'Daniel Wilson',
  ][id % 12],
  patient_phone: `+1 (555) ${100 + id}-${1000 + id}`,
  score_tier: id % 5 === 0 ? 'HIGH' : id % 3 === 0 ? 'MEDIUM' : 'LOW',
  score: 40 + (id * 7) % 55,
  reason: [
    'HIGH_SCORE', 'MEDIUM_SCORE', 'LOW_AI_CONFIDENCE',
    'AMBIGUOUS_RESPONSE', 'PATIENT_REQUESTED_HUMAN', 'DATA_CONFLICT',
  ][id % 6] as HumanReview['reason'],
  reason_for_visit: [
    'Dental implants consultation',
    'Wisdom tooth extraction',
    'Teeth whitening inquiry',
    'Orthodontic evaluation',
    'Emergency toothache',
    'Routine cleaning and checkup',
  ][id % 6],
  resolved: false,
  created_at: daysAgo(id % 5),
  updated_at: daysAgo(id % 5),
  confidence: 0.4 + (id % 6) * 0.1,
  extracted_fields: sampleExtracted,
  score_breakdown: sampleBreakdown,
  conversation: sampleMessages,
  ...overrides,
});

const reviews: HumanReview[] = Array.from({ length: 12 }, (_, i) => makeReview(i));

const patients: Patient[] = [
  { id: 'p-1', name: 'Sarah Mitchell', phone: '+1 (555) 101-1001', status: 'HUMAN_REVIEW', score_tier: 'HIGH', score: 78, last_updated: daysAgo(1), created_at: daysAgo(5), reason_for_visit: 'Dental implants consultation' },
  { id: 'p-2', name: 'James Rodriguez', phone: '+1 (555) 102-1002', status: 'BOOKED_VISIT', score_tier: 'HIGH', score: 82, last_updated: daysAgo(2), created_at: daysAgo(8), reason_for_visit: 'Wisdom tooth extraction' },
  { id: 'p-3', name: 'Emily Chen', phone: '+1 (555) 103-1003', status: 'QUALIFIED', score_tier: 'MEDIUM', score: 62, last_updated: daysAgo(1), created_at: daysAgo(6), reason_for_visit: 'Teeth whitening inquiry' },
  { id: 'p-4', name: 'Michael Thompson', phone: '+1 (555) 104-1004', status: 'WON', score_tier: 'HIGH', score: 85, last_updated: daysAgo(3), created_at: daysAgo(12), reason_for_visit: 'Dental implants consultation' },
  { id: 'p-5', name: 'Lisa Park', phone: '+1 (555) 105-1005', status: 'NURTURING', score_tier: 'MEDIUM', score: 55, last_updated: daysAgo(1), created_at: daysAgo(4), reason_for_visit: 'Orthodontic evaluation' },
  { id: 'p-6', name: 'David Kim', phone: '+1 (555) 106-1006', status: 'LOST', score_tier: 'LOW', score: 32, last_updated: daysAgo(5), created_at: daysAgo(10), reason_for_visit: 'Emergency toothache' },
  { id: 'p-7', name: 'Anna Williams', phone: '+1 (555) 107-1007', status: 'NEW_LEAD', score_tier: 'MEDIUM', score: 58, last_updated: daysAgo(0), created_at: daysAgo(0), reason_for_visit: 'Routine cleaning and checkup' },
  { id: 'p-8', name: 'Robert Johnson', phone: '+1 (555) 108-1008', status: 'INCOMPLETE', score_tier: 'LOW', score: 28, last_updated: daysAgo(2), created_at: daysAgo(3), reason_for_visit: 'Teeth whitening inquiry' },
  { id: 'p-9', name: 'Jessica Lee', phone: '+1 (555) 109-1009', status: 'BOOKED_VISIT', score_tier: 'HIGH', score: 76, last_updated: daysAgo(1), created_at: daysAgo(7), reason_for_visit: 'Wisdom tooth extraction' },
  { id: 'p-10', name: 'Christopher Brown', phone: '+1 (555) 110-1010', status: 'OPTED_OUT', score_tier: 'LOW', score: 15, last_updated: daysAgo(4), created_at: daysAgo(9), reason_for_visit: 'Orthodontic evaluation' },
  { id: 'p-11', name: 'Amanda Davis', phone: '+1 (555) 111-1011', status: 'QUALIFIED', score_tier: 'MEDIUM', score: 64, last_updated: daysAgo(1), created_at: daysAgo(5), reason_for_visit: 'Dental implants consultation' },
  { id: 'p-12', name: 'Daniel Wilson', phone: '+1 (555) 112-1012', status: 'WON', score_tier: 'HIGH', score: 88, last_updated: daysAgo(2), created_at: daysAgo(11), reason_for_visit: 'Emergency toothache' },
];

const appointments: Appointment[] = [
  { id: 'a-1', patient_id: 'p-2', patient_name: 'James Rodriguez', date: daysAgo(-1).split('T')[0], time: '09:00', status: 'BOOKED_VISIT', phone: '+1 (555) 102-1002' },
  { id: 'a-2', patient_id: 'p-9', patient_name: 'Jessica Lee', date: daysAgo(-1).split('T')[0], time: '10:30', status: 'BOOKED_VISIT', phone: '+1 (555) 109-1009' },
  { id: 'a-3', patient_id: 'p-1', patient_name: 'Sarah Mitchell', date: daysAgo(-2).split('T')[0], time: '14:00', status: 'BOOKED_VISIT', phone: '+1 (555) 101-1001' },
  { id: 'a-4', patient_id: 'p-11', patient_name: 'Amanda Davis', date: daysAgo(-3).split('T')[0], time: '11:00', status: 'BOOKED_VISIT', phone: '+1 (555) 111-1011' },
  { id: 'a-5', patient_id: 'p-3', patient_name: 'Emily Chen', date: daysAgo(-5).split('T')[0], time: '15:30', status: 'BOOKED_VISIT', phone: '+1 (555) 103-1003' },
  { id: 'a-6', patient_id: 'p-5', patient_name: 'Lisa Park', date: daysAgo(-7).split('T')[0], time: '09:30', status: 'BOOKED_VISIT', phone: '+1 (555) 105-1005' },
];

const dailyStats: { date: string; total_leads: number; booked: number }[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(now);
  d.setDate(d.getDate() - (13 - i));
  return {
    date: d.toISOString().split('T')[0],
    total_leads: 3 + Math.floor(Math.random() * 8),
    booked: 1 + Math.floor(Math.random() * 4),
  };
});

const stats: DashboardStats = {
  new_leads_14d: dailyStats.reduce((s, d) => s + d.total_leads, 0),
  awaiting_review: reviews.filter(r => !r.resolved).length,
  booked_this_period: dailyStats.reduce((s, d) => s + d.booked, 0),
  conversion_rate_30d: 0.34,
  daily_stats: dailyStats,
};

export async function mockFetch<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  await new Promise(r => setTimeout(r, 300 + Math.random() * 400));

  const url = new URL(path, 'http://mock');
  const method = options?.method || 'GET';

  // Human reviews
  if (path.startsWith('/human-reviews')) {
    const match = path.match(/^\/human-reviews\/([^/?]+)(?:\/(approve|correct|escalate|reject))?$/);
    if (match) {
      const id = match[1];
      if (method === 'POST') {
        const idx = reviews.findIndex(r => r.id === id);
        if (idx >= 0) reviews[idx].resolved = true;
        return { success: true, data: undefined as T };
      }
      const review = reviews.find(r => r.id === id);
      if (!review) return { success: false, error: 'Review not found' };
      return { success: true, data: review as T };
    }

    const resolved = url.searchParams.get('resolved');
    const reason = url.searchParams.get('reason');
    let filtered = [...reviews];
    if (resolved !== null) filtered = filtered.filter(r => String(r.resolved) === resolved);
    if (reason) filtered = filtered.filter(r => r.reason === reason);
    return { success: true, data: { reviews: filtered, total: filtered.length } as T };
  }

  // Patients
  if (path.startsWith('/patients')) {
    const match = path.match(/^\/patients\/([^/?]+)(?:\/(won|lost))?$/);
    if (match) {
      const id = match[1];
      if (method === 'POST') {
        const idx = patients.findIndex(p => p.id === id);
        if (idx >= 0) {
          if (path.endsWith('/won')) patients[idx].status = 'WON';
          if (path.endsWith('/lost')) patients[idx].status = 'LOST';
        }
        return { success: true, data: undefined as T };
      }
      const patient = patients.find(p => p.id === id);
      if (!patient) return { success: false, error: 'Patient not found' };
      return { success: true, data: patient as T };
    }

    const status = url.searchParams.get('status');
    let filtered = [...patients];
    if (status) filtered = filtered.filter(p => p.status === status);
    return { success: true, data: { patients: filtered, total: filtered.length } as T };
  }

  // Bookings
  if (path.startsWith('/bookings/availability')) {
    const date = url.searchParams.get('date') || now.toISOString().split('T')[0];
    const slots = [
      { date, time: '09:00', available: true },
      { date, time: '09:30', available: false },
      { date, time: '10:00', available: true },
      { date, time: '10:30', available: true },
      { date, time: '11:00', available: false },
      { date, time: '11:30', available: true },
      { date, time: '14:00', available: true },
      { date, time: '14:30', available: true },
      { date, time: '15:00', available: false },
      { date, time: '15:30', available: true },
      { date, time: '16:00', available: true },
    ];
    return { success: true, data: { slots } as T };
  }

  // Health
  if (path === '/health') {
    return { success: true, data: { status: 'ok' } as T };
  }

  return { success: false, error: 'Not found' };
}

export { reviews, patients, appointments, stats };
