// ========================================
// AI Provider Interface
// Abstraction over any LLM backend (Gemini, OpenAI, etc.)
// ========================================

import type { AIExtractionResult } from '../../types';

export interface FieldDefinition {
  type: string;
  required: boolean;
  description?: string;
  enum_values?: string[];
}

export interface AiProvider {
  extractAndAnswer(
    patientMessage: string,
    knowledgeContext: string,
    requiredFields: string[],
    fieldDefinitions?: Record<string, FieldDefinition>,
    conversationHistory?: string,
  ): Promise<AIExtractionResult>;
}
