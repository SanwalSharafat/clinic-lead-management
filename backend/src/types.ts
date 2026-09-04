// ========================================
// Shared Types & Enums
// ========================================

export enum PatientStatus {
  NEW_LEAD = 'NEW_LEAD',
  INCOMPLETE = 'INCOMPLETE',
  HUMAN_REVIEW = 'HUMAN_REVIEW',
  NURTURING = 'NURTURING',
  QUALIFIED = 'QUALIFIED',
  BOOKED_VISIT = 'BOOKED_VISIT',
  WON = 'WON',
  LOST = 'LOST',
  OPTED_OUT = 'OPTED_OUT',
}

export enum ReviewReason {
  HIGH_SCORE = 'HIGH_SCORE',
  MEDIUM_SCORE = 'MEDIUM_SCORE',
  LOW_AI_CONFIDENCE = 'LOW_AI_CONFIDENCE',
  AMBIGUOUS_RESPONSE = 'AMBIGUOUS_RESPONSE',
  PATIENT_REQUESTED_HUMAN = 'PATIENT_REQUESTED_HUMAN',
  DATA_CONFLICT = 'DATA_CONFLICT',
  BOOKING_FAILURE = 'BOOKING_FAILURE',
}

export enum HumanDecision {
  APPROVE = 'APPROVE',
  CORRECT = 'CORRECT',
  ESCALATE = 'ESCALATE',
  REJECT = 'REJECT',
}

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW',
}

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum Channel {
  WHATSAPP = 'whatsapp',
  WEB_FORM = 'web_form',
}

export enum ScoreTier {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

// ---- Database Row Types ----

export interface ClinicConfigRow {
  id: string;
  version: number;
  required_fields: string[];
  field_definitions: Record<string, FieldDefinition>;
  scoring_rules: ScoringRule[];
  thresholds: { high: number; medium: number };
  is_active: boolean;
  created_at: string;
}

export interface FieldDefinition {
  type: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  enum_values?: string[];
  description?: string;
}

export interface ScoringRule {
  field: string;
  operator: ScoringOperator;
  value: string | number | boolean;
  points: number;
}

export type ScoringOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'exists';

export interface PatientRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  source: Channel;
  raw_message: string | null;
  extracted_fields: Record<string, unknown>;
  lead_score: number | null;
  score_tier: ScoreTier | null;
  status: PatientStatus;
  attempt_count: number;
  config_version: number | null;
  assigned_staff_id: string | null;
  opted_out: boolean;
  created_at: string;
  updated_at: string;
}

export interface InteractionRow {
  id: string;
  patient_id: string;
  channel: Channel;
  message: string;
  direction: MessageDirection;
  external_message_id: string | null;
  created_at: string;
}

export interface AppointmentRow {
  id: string;
  patient_id: string;
  calendar_event_id: string | null;
  scheduled_time: string;
  status: AppointmentStatus;
  created_at: string;
}

export interface PendingBookingRow {
  id: string;
  requested_slot: string;
  calendar_id: string;
  patient_id: string;
  expires_at: string;
  created_at: string;
}

export interface HumanReviewRow {
  id: string;
  patient_id: string;
  reason: ReviewReason;
  ai_output: Record<string, unknown> | null;
  human_decision: HumanDecision | null;
  human_notes: string | null;
  reviewer_id: string | null;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
}

export interface ErrorLogRow {
  id: string;
  patient_id: string | null;
  service: string;
  operation: string;
  error_message: string;
  retry_count: number;
  created_at: string;
}

// ---- Scoring Engine Types ----

export interface ScoreResult {
  score: number;
  tier: ScoreTier;
  breakdown: RuleFired[];
}

export interface RuleFired {
  rule: ScoringRule;
  matched: boolean;
  actual_value: unknown;
}

// ---- AI Service Types ----

export interface AIExtractionResult {
  extracted_fields: Record<string, unknown>;
  answer: string;
  is_clinical_question: boolean;
  is_ambiguous: boolean;
  confidence: number;
  missing_required_fields: string[];
}

// ---- Calendar Service Types ----

export interface AvailabilityCheckResult {
  available: boolean;
  alternatives?: AlternativeSlot[];
}

export interface AlternativeSlot {
  start: string;
  end: string;
}

export interface BookingResult {
  success: boolean;
  calendar_event_id?: string;
  error?: string;
}

// ---- Messaging Types ----

export interface SendMessageResult {
  success: boolean;
  external_message_id?: string;
  error?: string;
}

export interface IncomingWhatsAppMessage {
  phone: string;
  message: string;
  external_message_id: string;
  timestamp?: string;
}

export interface IncomingFormSubmission {
  phone: string;
  name?: string;
  email?: string;
  message?: string;
  reason_for_visit?: string;
  urgency?: string;
  preferred_doctor?: string;
  insurance?: string;
  new_or_returning?: string;
  preferred_date?: string;
  preferred_time?: string;
}

// ---- Workflow Types ----

export interface WorkflowResult {
  patient: PatientRow;
  action_taken: string;
  sent_message?: string;
  human_review_created?: boolean;
  appointment_created?: boolean;
}
