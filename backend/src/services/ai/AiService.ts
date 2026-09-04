// ========================================
// AI Service
// Higher-level wrapper that loads knowledge context,
// delegates to an AiProvider, and handles error logging.
// ========================================

import type { AiProvider, FieldDefinition } from './AiProvider';
import { KnowledgeService } from '../knowledge/knowledgeService';
import type { AIExtractionResult } from '../../types';
import { ErrorLogRepository } from '../../repositories';

export class AiService {
  private provider: AiProvider;
  private knowledgeService: KnowledgeService;
  private errorLogRepo: ErrorLogRepository;

  constructor(
    provider: AiProvider,
    knowledgeService: KnowledgeService,
    errorLogRepo: ErrorLogRepository,
  ) {
    this.provider = provider;
    this.knowledgeService = knowledgeService;
    this.errorLogRepo = errorLogRepo;
  }

  async processMessage(
    patientMessage: string,
    requiredFields: string[],
    fieldDefinitions?: Record<string, FieldDefinition>,
    conversationHistory?: string,
    patientId?: string,
  ): Promise<AIExtractionResult> {
    try {
      const knowledgeContext = await this.knowledgeService.loadContext();
      return await this.provider.extractAndAnswer(
        patientMessage,
        knowledgeContext,
        requiredFields,
        fieldDefinitions,
        conversationHistory,
      );
    } catch (error) {
      await this.errorLogRepo.create({
        patient_id: patientId,
        service: 'ai',
        operation: 'processMessage',
        error_message: error instanceof Error ? error.message : String(error),
      });

      // Return a safe default that signals failure without exposing internals
      return {
        extracted_fields: {},
        answer: '',
        is_clinical_question: false,
        is_ambiguous: true,
        confidence: 0,
        missing_required_fields: [...requiredFields],
      };
    }
  }
}
