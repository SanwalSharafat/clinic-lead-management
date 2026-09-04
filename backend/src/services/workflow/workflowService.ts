// ========================================
// Workflow Orchestrator — Section 7 Pipeline
// Orchestrates the entire lead processing flow
// ========================================

import {
  PatientStatus,
  Channel,
  ScoreTier,
  ReviewReason,
  WorkflowResult,
  PatientRow,
} from '../../types';
import {
  PatientRepository,
  InteractionRepository,
  ErrorLogRepository,
  ClinicConfigRepository,
  HumanReviewRepository,
} from '../../repositories';
import { AiService } from '../ai';
import type { FieldDefinition } from '../ai/AiProvider';
import { KnowledgeService } from '../knowledge';
import { scoreLead } from '../scoring';
import { MessagingService } from '../messaging';
import { HumanReviewService } from '../human-review';
import { incomingWhatsAppSchema, incomingFormSchema } from '../../validators/schemas';
import { MessageDirection } from '../../types';

const MAX_ATTEMPTS = 3;
const NURTURE_MESSAGE =
  'Thank you for reaching out to BrightSmile Dental! ' +
  'We\'d love to help you with your dental care needs. ' +
  'Is there anything specific you\'d like to know about our services or would you like to schedule an appointment?';

export class WorkflowService {
  private patientRepo: PatientRepository;
  private interactionRepo: InteractionRepository;
  private errorLogRepo: ErrorLogRepository;
  private clinicConfigRepo: ClinicConfigRepository;
  private aiService: AiService;
  private messagingService: MessagingService;
  private humanReviewService: HumanReviewService;

  constructor(
    patientRepo: PatientRepository,
    interactionRepo: InteractionRepository,
    errorLogRepo: ErrorLogRepository,
    clinicConfigRepo: ClinicConfigRepository,
    aiService: AiService,
    _knowledgeService: KnowledgeService,
    messagingService: MessagingService,
    humanReviewService: HumanReviewService,
    _humanReviewRepo: HumanReviewRepository,
  ) {
    this.patientRepo = patientRepo;
    this.interactionRepo = interactionRepo;
    this.errorLogRepo = errorLogRepo;
    this.clinicConfigRepo = clinicConfigRepo;
    this.aiService = aiService;
    this.messagingService = messagingService;
    this.humanReviewService = humanReviewService;
  }

  // ========================================
  // Main entry point for WhatsApp messages
  // ========================================
  async processWhatsAppMessage(raw: unknown): Promise<WorkflowResult> {
    console.log('[WorkflowService] Starting WhatsApp message processing');
    console.log('[RAW INPUT]', JSON.stringify(raw, null, 2));

    // 1. Validate input (Zod)
    const parsed = incomingWhatsAppSchema.safeParse(raw);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => i.message).join(', ');
      console.error('[VALIDATION ERROR]', errors);
      throw new Error(`Invalid WhatsApp message: ${errors}`);
    }
    
    const input = parsed.data;
    console.log('[VALIDATED]', { phone: input.phone, message: input.message });

    return this.processIncomingMessage({
      phone: input.phone,
      message: input.message,
      externalMessageId: input.external_message_id,
      channel: Channel.WHATSAPP,
      rawMessage: input.message,
      preExtractedFields: {},
    });
  }

  // ========================================
  // Main entry point for web form submissions
  // ========================================
  async processFormSubmission(raw: unknown): Promise<WorkflowResult> {
    const parsed = incomingFormSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Invalid form submission: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      );
    }
    const input = parsed.data;

    // Pre-extract fields from the form
    const preExtracted: Record<string, unknown> = {};
    if (input.name) preExtracted.name = input.name;
    if (input.email) preExtracted.email = input.email;
    if (input.reason_for_visit) preExtracted.reason_for_visit = input.reason_for_visit;
    if (input.urgency) preExtracted.urgency = input.urgency;
    if (input.preferred_doctor) preExtracted.preferred_doctor = input.preferred_doctor;
    if (input.insurance) preExtracted.insurance = input.insurance;
    if (input.new_or_returning) preExtracted.new_or_returning = input.new_or_returning;
    if (input.preferred_date) preExtracted.preferred_date = input.preferred_date;
    if (input.preferred_time) preExtracted.preferred_time = input.preferred_time;

    // Generate a synthetic external_message_id for forms
    const formMessageId = `form-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    return this.processIncomingMessage({
      phone: input.phone,
      message: input.message || '',
      externalMessageId: formMessageId,
      channel: Channel.WEB_FORM,
      rawMessage: input.message || null,
      preExtractedFields: preExtracted,
    });
  }

  // ========================================
  // Core pipeline — Section 7 workflow
  // ========================================
  private async processIncomingMessage(params: {
    phone: string;
    message: string;
    externalMessageId: string;
    channel: Channel;
    rawMessage: string | null;
    preExtractedFields: Record<string, unknown>;
  }): Promise<WorkflowResult> {
    const { phone, message, externalMessageId, channel, rawMessage, preExtractedFields } =
      params;

    // --- Step 1: Check external_message_id for idempotency ---
    const existingInteraction = await this.interactionRepo.findByExternalId(externalMessageId);
    if (existingInteraction) {
      // Already processed — return the existing patient without re-processing
      const patient = await this.patientRepo.findByPhone(phone);
      if (patient) {
        return { patient, action_taken: 'ignored_duplicate' };
      }
      // Edge case: interaction exists but patient doesn't (data inconsistency)
      return {
        patient: {} as PatientRow,
        action_taken: 'ignored_duplicate',
      };
    }

    // --- Step 2: Check opted_out ---
    const isOptedOut = await this.patientRepo.isOptedOut(phone);
    if (isOptedOut) {
      return {
        patient: {} as PatientRow,
        action_taken: 'blocked_opted_out',
      };
    }

    // --- Step 3: Check for STOP/opt-out keywords ---
    const stopKeywords = ['stop', 'unsubscribe', 'opt out', 'opt-out', 'cancel', 'do not contact'];
    const normalizedMessage = message.toLowerCase().trim();
    if (stopKeywords.some((kw) => normalizedMessage === kw || normalizedMessage.includes(kw))) {
      // Check if it's a standalone stop command (exact or near-exact match)
      const isStopCommand =
        normalizedMessage === 'stop' ||
        normalizedMessage === 'unsubscribe' ||
        normalizedMessage === 'opt out' ||
        normalizedMessage === 'opt-out' ||
        normalizedMessage.startsWith('stop ') ||
        normalizedMessage.startsWith('please stop');

      if (isStopCommand) {
        await this.patientRepo.setOptedOut(phone);
        return {
          patient: {} as PatientRow,
          action_taken: 'opted_out',
        };
      }
    }

    // --- Step 4: Find or create patient by phone ---
    let patient = await this.patientRepo.findByPhone(phone);
    if (patient) {
      // Existing patient — merge will happen later after extraction
      // Log the incoming message
    } else {
      // New patient
      patient = await this.patientRepo.create({
        phone,
        source: channel,
        raw_message: rawMessage ?? undefined,
        extracted_fields: preExtractedFields,
      });
    }

    // --- Step 5: Save interaction ---
    await this.interactionRepo.create({
      patient_id: patient.id,
      channel,
      message,
      direction: MessageDirection.INBOUND,
      external_message_id: externalMessageId,
    });

    // --- Step 6: Load clinic config (Decision Layer) ---
    let clinicConfig;
    try {
      clinicConfig = await this.clinicConfigRepo.getActiveConfig();
    } catch (error) {
      await this.errorLogRepo.create({
        patient_id: patient.id,
        service: 'workflow',
        operation: 'loadConfig',
        error_message: 'Failed to load active clinic config',
      });
      // Cannot proceed without config
      await this.messagingService.sendMessage(
        phone,
        'We\'re experiencing a technical issue. Please try again later or call us directly.',
        patient.id,
      );
      return { patient, action_taken: 'error_no_config' };
    }

    const requiredFields: string[] = (clinicConfig.required_fields as string[]) || [];

    // --- Step 7: If this is a nurture reply, re-process through the pipeline ---
    if (patient.status === PatientStatus.NURTURING) {
      return this.handleNurtureReply(patient, message, clinicConfig, requiredFields);
    }

    // --- Step 8: If patient is in HUMAN_REVIEW, don't auto-process ---
    if (patient.status === PatientStatus.HUMAN_REVIEW) {
      // Just log the interaction (already done above) and wait for human to resolve
      return { patient, action_taken: 'awaiting_human_review' };
    }

    // --- Step 9: AI extraction ---
    // Build conversation history for context
    const pastInteractions = await this.interactionRepo.getByPatientId(patient.id);
    const conversationHistory = pastInteractions
      .map((i) => `${i.direction}: ${i.message}`)
      .join('\n');

    const aiResult = await this.aiService.processMessage(
      message,
      requiredFields,
      clinicConfig.field_definitions as Record<string, FieldDefinition>,
      conversationHistory,
      patient.id,
    );

    // --- Step 10: Handle clinical questions — NEVER answer, route to human ---
    if (aiResult.is_clinical_question) {
      await this.humanReviewService.createReview({
        patientId: patient.id,
        reason: ReviewReason.PATIENT_REQUESTED_HUMAN,
        aiOutput: {
          original_message: message,
          ai_answer: aiResult.answer,
          note: 'Patient asked a clinical/medical question',
        },
      });

      // Send a safe response to the patient
      await this.messagingService.sendMessage(
        phone,
        'Thank you for your question. For medical or clinical advice, one of our dentists will follow up with you directly. Is there anything else I can help with regarding scheduling or our services?',
        patient.id,
      );

      await this.interactionRepo.create({
        patient_id: patient.id,
        channel,
        message:
          'Thank you for your question. For medical or clinical advice, one of our dentists will follow up with you directly. Is there anything else I can help with regarding scheduling or our services?',
        direction: MessageDirection.OUTBOUND,
      });

      const updatedPatient = (await this.patientRepo.findById(patient.id)) as PatientRow;
      return { patient: updatedPatient, action_taken: 'clinical_question_routed_to_human' };
    }

    // --- Step 11: Handle ambiguous responses ---
    if (aiResult.is_ambiguous) {
      await this.humanReviewService.createReview({
        patientId: patient.id,
        reason: ReviewReason.AMBIGUOUS_RESPONSE,
        aiOutput: {
          original_message: message,
          ai_answer: aiResult.answer,
          confidence: aiResult.confidence,
        },
      });

      await this.messagingService.sendMessage(
        phone,
        'I want to make sure I understand you correctly. A team member will review your message and get back to you shortly. Thank you for your patience!',
        patient.id,
      );

      await this.interactionRepo.create({
        patient_id: patient.id,
        channel,
        message:
          'I want to make sure I understand you correctly. A team member will review your message and get back to you shortly. Thank you for your patience!',
        direction: MessageDirection.OUTBOUND,
      });

      const updatedPatient = (await this.patientRepo.findById(patient.id)) as PatientRow;
      return { patient: updatedPatient, action_taken: 'ambiguous_routed_to_human' };
    }

    // --- Step 12: Handle low confidence ---
    if (aiResult.confidence < 0.5) {
      await this.humanReviewService.createReview({
        patientId: patient.id,
        reason: ReviewReason.LOW_AI_CONFIDENCE,
        aiOutput: {
          original_message: message,
          extracted_fields: aiResult.extracted_fields,
          confidence: aiResult.confidence,
          missing_required_fields: aiResult.missing_required_fields,
        },
      });

      await this.patientRepo.updateStatus(patient.id, PatientStatus.HUMAN_REVIEW);
      const updatedPatient = (await this.patientRepo.findById(patient.id)) as PatientRow;
      return {
        patient: updatedPatient,
        action_taken: 'low_confidence_routed_to_human',
      };
    }

    // --- Step 13: Merge extracted fields with pre-extracted (for forms) and existing ---
    const mergedFields = { ...preExtractedFields, ...aiResult.extracted_fields };

    // Merge with existing patient fields (never blank out known fields)
    await this.patientRepo.updateExtractedFields(patient.id, mergedFields);

    // Log the merge event
    await this.errorLogRepo.create({
      patient_id: patient.id,
      service: 'workflow',
      operation: 'merge',
      error_message: `Merged ${Object.keys(mergedFields).length} fields into patient record`,
    });

    // Reload patient after merge
    patient = (await this.patientRepo.findById(patient.id)) as PatientRow;

    // --- Step 14: Send AI answer if it has one ---
    if (aiResult.answer && aiResult.answer.trim().length > 0) {
      await this.messagingService.sendMessage(phone, aiResult.answer, patient.id);
      await this.interactionRepo.create({
        patient_id: patient.id,
        channel,
        message: aiResult.answer,
        direction: MessageDirection.OUTBOUND,
      });
    }

    // --- Step 15: Check missing required fields ---
    const currentFields = patient.extracted_fields || {};
    const stillMissing = requiredFields.filter(
      (f) =>
        !currentFields[f] ||
        currentFields[f] === '' ||
        currentFields[f] === null ||
        currentFields[f] === undefined,
    );

    if (stillMissing.length > 0) {
      if (patient.attempt_count < MAX_ATTEMPTS) {
        // Ask ONLY the missing fields
        const missingFieldsPrompt = this.buildMissingFieldsPrompt(stillMissing);
        await this.messagingService.sendMessage(phone, missingFieldsPrompt, patient.id);
        await this.interactionRepo.create({
          patient_id: patient.id,
          channel,
          message: missingFieldsPrompt,
          direction: MessageDirection.OUTBOUND,
        });

        const updated = await this.patientRepo.incrementAttemptCount(patient.id);
        return {
          patient: updated,
          action_taken: 'asked_missing_fields',
          sent_message: missingFieldsPrompt,
        };
      } else {
        // Max attempts reached — create human review
        await this.humanReviewService.createReview({
          patientId: patient.id,
          reason: ReviewReason.DATA_CONFLICT,
          aiOutput: {
            missing_fields: stillMissing,
            attempt_count: patient.attempt_count + 1,
            all_extracted_fields: currentFields,
          },
        });

        await this.patientRepo.updateStatus(patient.id, PatientStatus.INCOMPLETE);
        const updatedPatient = (await this.patientRepo.findById(patient.id)) as PatientRow;
        return {
          patient: updatedPatient,
          action_taken: 'max_attempts_incomplete',
          human_review_created: true,
        };
      }
    }

    // --- Step 16: All required fields present — proceed to scoring ---
    const scoreResult = scoreLead(
      {
        scoring_rules: clinicConfig.scoring_rules as import('../../types').ScoringRule[],
        thresholds: clinicConfig.thresholds as { high: number; medium: number },
      },
      currentFields,
    );

    await this.patientRepo.updateScore(
      patient.id,
      scoreResult.score,
      scoreResult.tier,
    );
    patient = (await this.patientRepo.findById(patient.id)) as PatientRow;

    // --- Step 17: Route based on score tier ---
    if (scoreResult.tier === ScoreTier.HIGH || scoreResult.tier === ScoreTier.MEDIUM) {
      // Create human review, notify staff, do NOT auto-promise appointment
      const reason =
        scoreResult.tier === ScoreTier.HIGH
          ? ReviewReason.HIGH_SCORE
          : ReviewReason.MEDIUM_SCORE;

      await this.humanReviewService.createReview({
        patientId: patient.id,
        reason,
        aiOutput: {
          score: scoreResult.score,
          tier: scoreResult.tier,
          breakdown: scoreResult.breakdown,
          extracted_fields: currentFields,
        },
      });

      // Tell patient their request is being reviewed
      const reviewMessage =
        'Thank you for your interest! Our team is reviewing your request and will get back to you shortly to confirm your appointment details.';
      await this.messagingService.sendMessage(phone, reviewMessage, patient.id);
      await this.interactionRepo.create({
        patient_id: patient.id,
        channel,
        message: reviewMessage,
        direction: MessageDirection.OUTBOUND,
      });

      return {
        patient,
        action_taken: `scored_${scoreResult.tier.toLowerCase()}_routed_to_human_review`,
        human_review_created: true,
        sent_message: reviewMessage,
      };
    }

    // --- Step 18: LOW score → nurturing ---
    await this.patientRepo.updateStatus(patient.id, PatientStatus.NURTURING);

    // Send one automated nurture message
    await this.messagingService.sendMessage(phone, NURTURE_MESSAGE, patient.id);
    await this.interactionRepo.create({
      patient_id: patient.id,
      channel,
      message: NURTURE_MESSAGE,
      direction: MessageDirection.OUTBOUND,
    });

    return {
      patient,
      action_taken: 'scored_low_nurturing',
      sent_message: NURTURE_MESSAGE,
    };
  }

  // ========================================
  // Handle nurture reply — re-extract, re-score, re-route
  // ========================================
  private async handleNurtureReply(
    patient: PatientRow,
    message: string,
    clinicConfig: import('../../types').ClinicConfigRow,
    requiredFields: string[],
  ): Promise<WorkflowResult> {
    // Build conversation history
    const pastInteractions = await this.interactionRepo.getByPatientId(patient.id);
    const conversationHistory = pastInteractions
      .map((i) => `${i.direction}: ${i.message}`)
      .join('\n');

    // Re-run extraction
    const aiResult = await this.aiService.processMessage(
      message,
      requiredFields,
      clinicConfig.field_definitions as Record<string, FieldDefinition>,
      conversationHistory,
      patient.id,
    );

    // Check for clinical question
    if (aiResult.is_clinical_question) {
      await this.humanReviewService.createReview({
        patientId: patient.id,
        reason: ReviewReason.PATIENT_REQUESTED_HUMAN,
        aiOutput: { original_message: message, note: 'Clinical question during nurture' },
      });

      const updatedPatient = (await this.patientRepo.findById(patient.id)) as PatientRow;
      return { patient: updatedPatient, action_taken: 'nurture_clinical_routed_to_human' };
    }

    // Merge new extracted fields
    if (Object.keys(aiResult.extracted_fields).length > 0) {
      await this.patientRepo.updateExtractedFields(patient.id, aiResult.extracted_fields);
      await this.errorLogRepo.create({
        patient_id: patient.id,
        service: 'workflow',
        operation: 'merge',
        error_message: `Nurture merge: ${Object.keys(aiResult.extracted_fields).length} fields`,
      });
    }

    // Send AI answer if any
    if (aiResult.answer && aiResult.answer.trim().length > 0) {
      await this.messagingService.sendMessage(
        patient.phone,
        aiResult.answer,
        patient.id,
      );
      await this.interactionRepo.create({
        patient_id: patient.id,
        channel: patient.source,
        message: aiResult.answer,
        direction: MessageDirection.OUTBOUND,
      });
    }

    // Re-score with all accumulated fields
    patient = (await this.patientRepo.findById(patient.id)) as PatientRow;
    const currentFields = patient.extracted_fields || {};

    const scoreResult = scoreLead(
      {
        scoring_rules: clinicConfig.scoring_rules as import('../../types').ScoringRule[],
        thresholds: clinicConfig.thresholds as { high: number; medium: number },
      },
      currentFields,
    );

    await this.patientRepo.updateScore(patient.id, scoreResult.score, scoreResult.tier);
    patient = (await this.patientRepo.findById(patient.id)) as PatientRow;

    // Re-route
    if (scoreResult.tier === ScoreTier.HIGH || scoreResult.tier === ScoreTier.MEDIUM) {
      const reason =
        scoreResult.tier === ScoreTier.HIGH
          ? ReviewReason.HIGH_SCORE
          : ReviewReason.MEDIUM_SCORE;

      await this.humanReviewService.createReview({
        patientId: patient.id,
        reason,
        aiOutput: {
          score: scoreResult.score,
          tier: scoreResult.tier,
          breakdown: scoreResult.breakdown,
          escalated_from: 'NURTURING',
        },
      });

      return {
        patient,
        action_taken: `nurture_escalated_to_${scoreResult.tier.toLowerCase()}_human_review`,
        human_review_created: true,
      };
    }

    // Still LOW — stay in nurturing
    return {
      patient,
      action_taken: 'nurture_reply_scored_low_remaining',
    };
  }

  // ========================================
  // Build a prompt asking for missing fields
  // ========================================
  private buildMissingFieldsPrompt(missingFields: string[]): string {
    const fieldDescriptions: Record<string, string> = {
      reason_for_visit: 'the reason for your visit (e.g., cleaning, checkup, tooth pain, whitening)',
      urgency: 'how urgent this is (emergency, urgent, routine, cosmetic, or consultation)',
      preferred_doctor: 'if you have a preferred doctor',
      insurance: 'your insurance provider',
      new_or_returning: 'whether you\'re a new or returning patient',
      name: 'your full name',
      email: 'your email address',
      preferred_date: 'your preferred date for an appointment',
      preferred_time: 'your preferred time',
    };

    const fieldList = missingFields
      .map((f) => `- ${fieldDescriptions[f] || f}`)
      .join('\n');

    return `To help you better, could you please provide:\n${fieldList}`;
  }
}