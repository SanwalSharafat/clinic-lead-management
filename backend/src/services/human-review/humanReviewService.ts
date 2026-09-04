import {
  ReviewReason,
  HumanDecision,
  PatientStatus,
  ScoreTier,
} from '../../types';
import type { HumanReviewRow, ScoreResult } from '../../types';
import {
  HumanReviewRepository,
  PatientRepository,
  ErrorLogRepository,
  InteractionRepository,
  ClinicConfigRepository,
} from '../../repositories';
import { MessagingService } from '../messaging';
import { scoreLead } from '../scoring';
import {
  approveReviewSchema,
  correctReviewSchema,
  escalateReviewSchema,
  rejectReviewSchema,
} from '../../validators/schemas';

function hasMinimumRequiredFields(
  extractedFields: Record<string, unknown>,
  requiredFields: string[],
): boolean {
  if (requiredFields.length === 0) return true;
  return requiredFields.every(
    (field) =>
      field in extractedFields &&
      extractedFields[field] !== null &&
      extractedFields[field] !== undefined &&
      extractedFields[field] !== '',
  );
}

function buildStaffNotification(
  patientName: string | null,
  patientPhone: string,
  score: number | null,
  tier: ScoreTier | null,
  reason: ReviewReason,
  reviewId: string,
): string {
  const nameDisplay = patientName ?? 'Unknown';
  const scoreDisplay = score !== null ? score : 'N/A';
  const tierDisplay = tier ?? 'N/A';
  const reasonDisplay = reason.replace(/_/g, ' ');

  return (
    `🔔 New Lead Requires Human Review\n\n` +
    `Patient: ${nameDisplay}\n` +
    `Phone: ${patientPhone}\n` +
    `Score: ${scoreDisplay} | Tier: ${tierDisplay}\n` +
    `Reason: ${reasonDisplay}\n` +
    `Review ID: ${reviewId}\n\n` +
    `Please review this lead in the dashboard and take the appropriate action.`
  );
}

export class HumanReviewService {
  private reviewRepo: HumanReviewRepository;
  private patientRepo: PatientRepository;
  private errorLogRepo: ErrorLogRepository;
  private interactionRepo: InteractionRepository;
  private clinicConfigRepo: ClinicConfigRepository;
  private messagingService: MessagingService;

  constructor(
    reviewRepo: HumanReviewRepository,
    patientRepo: PatientRepository,
    errorLogRepo: ErrorLogRepository,
    interactionRepo: InteractionRepository,
    clinicConfigRepo: ClinicConfigRepository,
    messagingService: MessagingService,
  ) {
    this.reviewRepo = reviewRepo;
    this.patientRepo = patientRepo;
    this.errorLogRepo = errorLogRepo;
    this.interactionRepo = interactionRepo;
    this.clinicConfigRepo = clinicConfigRepo;
    this.messagingService = messagingService;
  }

  async createReview(params: {
    patientId: string;
    reason: ReviewReason;
    aiOutput?: Record<string, unknown>;
  }): Promise<HumanReviewRow> {
    const { patientId, reason, aiOutput } = params;

    // 1. Create the review record
    const review = await this.reviewRepo.create({
      patient_id: patientId,
      reason,
      ai_output: aiOutput,
    });

    // 2. Update patient status to HUMAN_REVIEW
    await this.patientRepo.updateStatus(patientId, PatientStatus.HUMAN_REVIEW);

    // 3. If HIGH_SCORE or MEDIUM_SCORE, notify staff
    if (reason === ReviewReason.HIGH_SCORE || reason === ReviewReason.MEDIUM_SCORE) {
      try {
        const patient = await this.patientRepo.findById(patientId);
        if (patient) {
          const staffPhone = process.env.STAFF_PHONE_NUMBER;
          if (staffPhone) {
            const notification = buildStaffNotification(
              patient.name,
              patient.phone,
              patient.lead_score,
              patient.score_tier,
              reason,
              review.id,
            );
            await this.messagingService.sendMessage(staffPhone, notification, patientId);
          }
        }
      } catch (err) {
        await this.errorLogRepo.create({
          patient_id: patientId,
          service: 'human-review',
          operation: 'createReview.staffNotification',
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return review;
  }

  async approveReview(
    reviewId: string,
    data: { reviewer_id: string; notes?: string },
  ): Promise<HumanReviewRow> {
    // 1. Validate input
    const parsed = approveReviewSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    // 2. Find the review, throw if not found or already resolved
    const review = await this.reviewRepo.findById(reviewId);
    if (!review) {
      throw new Error(`Review [${reviewId}] not found`);
    }
    if (review.resolved) {
      throw new Error(`Review [${reviewId}] is already resolved`);
    }

    // 3. Resolve with APPROVE decision
    const resolvedReview = await this.reviewRepo.resolve(reviewId, {
      human_decision: HumanDecision.APPROVE,
      human_notes: parsed.data.notes,
      reviewer_id: parsed.data.reviewer_id,
    });

    // 4. Get the patient and determine next step
    const patient = await this.patientRepo.findById(review.patient_id);
    if (!patient) {
      throw new Error(`Patient [${review.patient_id}] not found`);
    }

    try {
      const config = await this.clinicConfigRepo.getActiveConfig();
      const hasRequired = hasMinimumRequiredFields(
        patient.extracted_fields,
        config.required_fields,
      );

      if (
        (patient.score_tier === ScoreTier.HIGH ||
          patient.score_tier === ScoreTier.MEDIUM) &&
        hasRequired
      ) {
        // Qualified — notify patient
        await this.patientRepo.updateStatus(patient.id, PatientStatus.QUALIFIED);
        await this.messagingService.sendMessage(
          patient.phone,
          'Thank you for your interest! A staff member from our clinic will contact you shortly to assist with your appointment.',
          patient.id,
        );
      } else if (patient.score_tier === ScoreTier.LOW) {
        await this.patientRepo.updateStatus(patient.id, PatientStatus.NURTURING);
      } else {
        // Missing required fields
        await this.patientRepo.updateStatus(patient.id, PatientStatus.INCOMPLETE);
      }
    } catch (err) {
      // If we can't determine next step (e.g. no config), default to INCOMPLETE
      if (err instanceof Error && err.message.includes('No active clinic configuration')) {
        await this.patientRepo.updateStatus(patient.id, PatientStatus.INCOMPLETE);
      } else {
        await this.errorLogRepo.create({
          patient_id: patient.id,
          service: 'human-review',
          operation: 'approveReview.determineNextStep',
          error_message: err instanceof Error ? err.message : String(err),
        });
        await this.patientRepo.updateStatus(patient.id, PatientStatus.INCOMPLETE);
      }
    }

    return resolvedReview;
  }

  async correctReview(
    reviewId: string,
    data: {
      reviewer_id: string;
      corrected_fields: Record<string, unknown>;
      notes?: string;
    },
  ): Promise<HumanReviewRow> {
    // 1. Validate input
    const parsed = correctReviewSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    // 2. Find the review, throw if not found or already resolved
    const review = await this.reviewRepo.findById(reviewId);
    if (!review) {
      throw new Error(`Review [${reviewId}] not found`);
    }
    if (review.resolved) {
      throw new Error(`Review [${reviewId}] is already resolved`);
    }

    // 3. Get the patient
    const patient = await this.patientRepo.findById(review.patient_id);
    if (!patient) {
      throw new Error(`Patient [${review.patient_id}] not found`);
    }

    // 4. Merge corrected_fields into patient.extracted_fields (never blank out existing)
    const merged = { ...patient.extracted_fields };
    for (const [key, value] of Object.entries(parsed.data.corrected_fields)) {
      if (value !== null && value !== undefined && value !== '') {
        merged[key] = value;
      }
    }

    // 5. Re-score the patient using the merged fields
    let newScore: number;
    let newTier: ScoreTier;
    try {
      const config = await this.clinicConfigRepo.getActiveConfig();
      const scoreResult: ScoreResult = scoreLead(
        { scoring_rules: config.scoring_rules, thresholds: config.thresholds },
        merged,
      );
      newScore = scoreResult.score;
      newTier = scoreResult.tier;

      // 6. Update patient with new extracted_fields, score, tier
      await this.patientRepo.update(patient.id, {
        extracted_fields: merged,
        lead_score: newScore,
        score_tier: newTier,
      });
    } catch (err) {
      await this.errorLogRepo.create({
        patient_id: patient.id,
        service: 'human-review',
        operation: 'correctReview.rescore',
        error_message: err instanceof Error ? err.message : String(err),
      });
      // Still save the corrected fields even if scoring fails
      await this.patientRepo.update(patient.id, {
        extracted_fields: merged,
      });
      newScore = patient.lead_score ?? 0;
      newTier = patient.score_tier ?? ScoreTier.LOW;
    }

    // 7. Resolve the review with CORRECT decision
    const resolvedReview = await this.reviewRepo.resolve(reviewId, {
      human_decision: HumanDecision.CORRECT,
      human_notes: parsed.data.notes,
      reviewer_id: parsed.data.reviewer_id,
    });

    // 8. After correction, set status to QUALIFIED and notify patient
    try {
      await this.patientRepo.updateStatus(patient.id, PatientStatus.QUALIFIED);
      await this.messagingService.sendMessage(
        patient.phone,
        'Thank you for your patience! We\'ve updated your information. A staff member from our clinic will reach out to you shortly.',
        patient.id,
      );
    } catch (err) {
      await this.errorLogRepo.create({
        patient_id: patient.id,
        service: 'human-review',
        operation: 'correctReview.notifyPatient',
        error_message: err instanceof Error ? err.message : String(err),
      });
    }

    return resolvedReview;
  }

  async escalateReview(
    reviewId: string,
    data: { reviewer_id: string; notes: string },
  ): Promise<HumanReviewRow> {
    // 1. Validate input
    const parsed = escalateReviewSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    // 2. Find the review, throw if not found or already resolved
    const review = await this.reviewRepo.findById(reviewId);
    if (!review) {
      throw new Error(`Review [${reviewId}] not found`);
    }
    if (review.resolved) {
      throw new Error(`Review [${reviewId}] is already resolved`);
    }

    // 3. Resolve with ESCALATE decision
    const resolvedReview = await this.reviewRepo.resolve(reviewId, {
      human_decision: HumanDecision.ESCALATE,
      human_notes: parsed.data.notes,
      reviewer_id: parsed.data.reviewer_id,
    });

    // 4. Log the escalation and notify staff if STAFF_PHONE_NUMBER is available
    const patient = await this.patientRepo.findById(review.patient_id);
    const patientName = patient?.name ?? 'Unknown';
    const patientPhone = patient?.phone ?? 'Unknown';

    await this.errorLogRepo.create({
      patient_id: review.patient_id,
      service: 'human-review',
      operation: 'escalateReview',
      error_message: `Review [${reviewId}] for patient ${patientName} (${patientPhone}) escalated. Notes: ${parsed.data.notes}`,
    });

    // Notify staff about the escalation
    const staffPhone = process.env.STAFF_PHONE_NUMBER;
    if (staffPhone) {
      try {
        const escalationMessage =
          `⚠️ Lead Escalated — Requires Senior Attention\n\n` +
          `Patient: ${patientName}\n` +
          `Phone: ${patientPhone}\n` +
          `Review ID: ${reviewId}\n` +
          `Escalation Notes: ${parsed.data.notes}\n\n` +
          `Please review this escalated lead as soon as possible.`;

        await this.messagingService.sendMessage(staffPhone, escalationMessage, review.patient_id);
      } catch (err) {
        await this.errorLogRepo.create({
          patient_id: review.patient_id,
          service: 'human-review',
          operation: 'escalateReview.staffNotification',
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Patient remains in HUMAN_REVIEW status (no status change needed)
    return resolvedReview;
  }

  async rejectReview(
    reviewId: string,
    data: { reviewer_id: string; reason: string; notes?: string },
  ): Promise<HumanReviewRow> {
    // 1. Validate input
    const parsed = rejectReviewSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    }

    // 2. Find the review, throw if not found or already resolved
    const review = await this.reviewRepo.findById(reviewId);
    if (!review) {
      throw new Error(`Review [${reviewId}] not found`);
    }
    if (review.resolved) {
      throw new Error(`Review [${reviewId}] is already resolved`);
    }

    // 3. Resolve with REJECT decision
    const combinedNotes = parsed.data.notes
      ? `[Rejection reason: ${parsed.data.reason}] ${parsed.data.notes}`
      : `[Rejection reason: ${parsed.data.reason}]`;

    const resolvedReview = await this.reviewRepo.resolve(reviewId, {
      human_decision: HumanDecision.REJECT,
      human_notes: combinedNotes,
      reviewer_id: parsed.data.reviewer_id,
    });

    // 4. Update patient status to LOST
    await this.patientRepo.updateStatus(review.patient_id, PatientStatus.LOST);

    // 5. Send a polite closing message to the patient
    const patient = await this.patientRepo.findById(review.patient_id);
    if (patient) {
      try {
        await this.messagingService.sendMessage(
          patient.phone,
          'Thank you for reaching out to us. We\'re unable to proceed at this time, but please feel free to contact us again in the future. We wish you well!',
          patient.id,
        );
      } catch (err) {
        await this.errorLogRepo.create({
          patient_id: patient.id,
          service: 'human-review',
          operation: 'rejectReview.closingMessage',
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return resolvedReview;
  }

  async getReviewDetail(
    reviewId: string,
  ): Promise<{
    review: HumanReviewRow;
    patient: {
      id: string;
      name: string | null;
      phone: string;
      email: string | null;
      extracted_fields: Record<string, unknown>;
      lead_score: number | null;
      score_tier: ScoreTier | null;
      status: PatientStatus;
      attempt_count: number;
    };
    conversation: Array<{ message: string; direction: string; created_at: string }>;
  }> {
    // 1. Find the review
    const review = await this.reviewRepo.findById(reviewId);
    if (!review) {
      throw new Error(`Review [${reviewId}] not found`);
    }

    // 2. Find the patient
    const patient = await this.patientRepo.findById(review.patient_id);
    if (!patient) {
      throw new Error(`Patient [${review.patient_id}] not found`);
    }

    // 3. Get conversation history from interactionRepo
    const interactions = await this.interactionRepo.getByPatientId(review.patient_id);
    const conversation = interactions.map((i) => ({
      message: i.message,
      direction: i.direction,
      created_at: i.created_at,
    }));

    // 4. Return combined object
    return {
      review,
      patient: {
        id: patient.id,
        name: patient.name,
        phone: patient.phone,
        email: patient.email,
        extracted_fields: patient.extracted_fields,
        lead_score: patient.lead_score,
        score_tier: patient.score_tier,
        status: patient.status,
        attempt_count: patient.attempt_count,
      },
      conversation,
    };
  }

  async listReviews(filters?: {
    resolved?: boolean;
    reason?: ReviewReason;
    limit?: number;
    offset?: number;
  }): Promise<HumanReviewRow[]> {
    return this.reviewRepo.list(filters);
  }
}
