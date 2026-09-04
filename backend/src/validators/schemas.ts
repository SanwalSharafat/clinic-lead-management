// ========================================
// Zod Validation Schemas
// Every data crossing a boundary is validated here
// ========================================

import { z } from 'zod';

// ---- WhatsApp Webhook Payload ----

export const incomingWhatsAppSchema = z.object({
  phone: z
    .string()
    .min(1, 'Phone is required')
    .regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone number format (E.164 expected)'),
  message: z.string().min(1, 'Message is required').max(5000, 'Message too long'),
  external_message_id: z.string().min(1, 'External message ID is required'),
  timestamp: z.string().optional(),
});

export type IncomingWhatsAppInput = z.infer<typeof incomingWhatsAppSchema>;

// ---- Web Form Submission ----

export const incomingFormSchema = z.object({
  phone: z
    .string()
    .min(1, 'Phone is required')
    .regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone number format'),
  name: z.string().max(200).optional(),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  message: z.string().max(5000).optional(),
  reason_for_visit: z.string().max(500).optional(),
  urgency: z
    .enum(['emergency', 'urgent', 'routine', 'cosmetic', 'consultation'])
    .optional(),
  preferred_doctor: z.string().max(200).optional(),
  insurance: z.string().max(200).optional(),
  new_or_returning: z.enum(['new', 'returning']).optional(),
  preferred_date: z.string().optional(),
  preferred_time: z.string().optional(),
});

export type IncomingFormInput = z.infer<typeof incomingFormSchema>;

// ---- AI Extraction Output ----

export const aiExtractionSchema = z.object({
  extracted_fields: z.record(z.unknown()).default({}),
  answer: z.string().max(2000),
  is_clinical_question: z.boolean(),
  is_ambiguous: z.boolean(),
  confidence: z.number().min(0).max(1),
  missing_required_fields: z.array(z.string()).default([]),
});

export type AIExtractionOutput = z.infer<typeof aiExtractionSchema>;

// ---- Scoring Config (stored in clinic_config) ----

export const scoringOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'contains',
  'exists',
]);

export const scoringRuleSchema = z.object({
  field: z.string().min(1),
  operator: scoringOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
  points: z.number().int().min(0),
});

export const thresholdsSchema = z.object({
  high: z.number().int().min(0),
  medium: z.number().int().min(0),
});

export const fieldDefinitionSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'enum']),
  required: z.boolean(),
  enum_values: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const clinicConfigSchema = z.object({
  required_fields: z.array(z.string().min(1)),
  field_definitions: z.record(fieldDefinitionSchema),
  scoring_rules: z.array(scoringRuleSchema),
  thresholds: thresholdsSchema,
});

export type ClinicConfig = z.infer<typeof clinicConfigSchema>;

// ---- Human Review Actions ----

export const approveReviewSchema = z.object({
  reviewer_id: z.string().uuid('Invalid reviewer ID'),
  notes: z.string().max(2000).optional(),
});

export const correctReviewSchema = z.object({
  reviewer_id: z.string().uuid('Invalid reviewer ID'),
  corrected_fields: z.record(z.unknown()),
  notes: z.string().max(2000).optional(),
});

export const escalateReviewSchema = z.object({
  reviewer_id: z.string().uuid('Invalid reviewer ID'),
  notes: z.string().min(1, 'Notes required for escalation').max(2000),
});

export const rejectReviewSchema = z.object({
  reviewer_id: z.string().uuid('Invalid reviewer ID'),
  reason: z.string().min(1, 'Rejection reason is required').max(1000),
  notes: z.string().max(2000).optional(),
});

export const patientOutcomeSchema = z.object({
  staff_id: z.string().uuid('Invalid staff ID'),
  notes: z.string().max(2000).optional(),
});

// ---- Calendar / Booking ----

export const bookingRequestSchema = z.object({
  patient_id: z.string().uuid(),
  requested_slot: z.string().datetime({ offset: true }),
  duration_minutes: z.number().int().min(15).max(180).default(30),
  summary: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
});

export type BookingRequest = z.infer<typeof bookingRequestSchema>;

// ---- Patient Update (for human correct action) ----

export const patientUpdateSchema = z.object({
  name: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal('')),
  extracted_fields: z.record(z.unknown()).optional(),
  lead_score: z.number().int().optional(),
  score_tier: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
});
