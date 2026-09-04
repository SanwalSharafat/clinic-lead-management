export type PatientStatus =
  | 'NEW_LEAD'
  | 'INCOMPLETE'
  | 'HUMAN_REVIEW'
  | 'NURTURING'
  | 'QUALIFIED'
  | 'BOOKED_VISIT'
  | 'WON'
  | 'LOST'
  | 'OPTED_OUT';

export type ReviewReason =
  | 'HIGH_SCORE'
  | 'MEDIUM_SCORE'
  | 'LOW_AI_CONFIDENCE'
  | 'AMBIGUOUS_RESPONSE'
  | 'PATIENT_REQUESTED_HUMAN'
  | 'DATA_CONFLICT';

export type ScoreTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ScoreBreakdownItem {
  rule: string;
  points: number;
  description: string;
}

export interface ExtractedField {
  key: string;
  value: string;
  confidence: number;
}

export interface HumanReview {
  id: string;
  patient_id: string;
  patient_name: string;
  patient_phone?: string;
  score_tier: ScoreTier;
  score: number;
  reason: ReviewReason;
  reason_for_visit?: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
  confidence?: number;
  extracted_fields?: ExtractedField[];
  score_breakdown?: ScoreBreakdownItem[];
  conversation?: Message[];
}

export interface Patient {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: PatientStatus;
  score_tier: ScoreTier;
  score: number;
  last_updated: string;
  created_at: string;
  reason_for_visit?: string;
  conversation?: Message[];
}

export interface BookingSlot {
  date: string;
  time: string;
  available: boolean;
}

export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string;
  date: string;
  time: string;
  status: PatientStatus;
  phone?: string;
}

export interface DailyLeadStats {
  date: string;
  total_leads: number;
  booked: number;
}

export interface DashboardStats {
  new_leads_14d: number;
  awaiting_review: number;
  booked_this_period: number;
  conversion_rate_30d: number;
  daily_stats: DailyLeadStats[];
}

export type Section = 'overview' | 'patients' | 'appointments' | 'settings';
