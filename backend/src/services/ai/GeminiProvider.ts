// ========================================
// Gemini AI Provider
// Uses Gemini 2.5 Flash to extract structured data from
// patient messages and answer clinic knowledge questions.
// ========================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AiProvider, FieldDefinition } from './AiProvider';
import type { AIExtractionResult } from '../../types';
import { aiExtractionSchema } from '../../validators/schemas';

/**
 * Format field_definitions into a human-readable block for the prompt,
 * spelling out type, whether it's required, and — critically — the exact
 * allowed values for enum fields. Without this, the model has no way to
 * know that e.g. `urgency` must be one of a fixed set of strings, and will
 * happily invent plausible-but-invalid values like "today" instead of
 * "emergency".
 */
function formatFieldDefinitions(
  fieldDefinitions?: Record<string, FieldDefinition>,
): string {
  if (!fieldDefinitions || Object.keys(fieldDefinitions).length === 0) {
    return '';
  }
  const lines = Object.entries(fieldDefinitions).map(([name, def]) => {
    let line = `- ${name} (${def.type}${def.required ? ', required' : ', optional'})`;
    if (def.description) line += `: ${def.description}`;
    if (def.enum_values && def.enum_values.length > 0) {
      line += ` — MUST be exactly one of: ${def.enum_values.map((v) => `"${v}"`).join(', ')}. Do not invent other values; map the patient's wording to the closest allowed value.`;
    }
    return line;
  });
  return `\n\nFIELD DEFINITIONS (use these exact constraints):\n${lines.join('\n')}`;
}

/**
 * Strip or null-out any extracted enum field whose value isn't in the
 * allowed list. This is the safety net for when the model ignores the
 * prompt instruction — an invalid enum value must never reach scoring,
 * since scoring_rules match on exact allowed values.
 */
function sanitizeEnumFields(
  extractedFields: Record<string, unknown>,
  fieldDefinitions?: Record<string, FieldDefinition>,
): Record<string, unknown> {
  if (!fieldDefinitions) return extractedFields;
  const sanitized = { ...extractedFields };
  for (const [name, def] of Object.entries(fieldDefinitions)) {
    if (def.enum_values && name in sanitized) {
      const value = sanitized[name];
      if (typeof value === 'string' && !def.enum_values.includes(value)) {
        // Invalid enum value — treat as not-extracted rather than let a
        // bogus value silently corrupt scoring. It will now correctly
        // surface as a missing required field for a follow-up question.
        delete sanitized[name];
      }
    }
  }
  return sanitized;
}

// ---------- helpers ----------------------------------------------------------

/**
 * Attempt to extract a JSON object from text that may be wrapped in
 * markdown code fences or surrounded by other prose.
 */
function extractJsonFromText(text: string): Record<string, unknown> | null {
  // 1. Try the raw text directly
  try {
    const parsed = JSON.parse(text.trim());
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // continue
  }

  // 2. Try to find a ```json ... ``` or ``` ... ``` block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch?.[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // continue
    }
  }

  // 3. Try to find the first { ... } brace-balanced object
  const firstBrace = text.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let end = -1;
    for (let i = firstBrace; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end !== -1) {
      try {
        const parsed = JSON.parse(text.substring(firstBrace, end));
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // continue
      }
    }
  }

  return null;
}

/**
 * Build a safe default result when parsing or the API call fails.
 */
function buildFallbackResult(
  patientMessage: string,
  requiredFields: string[],
  _reason?: string,
): AIExtractionResult {
  // Quick heuristic: if the message contains clinical-sounding terms, flag it
  const clinicalKeywords =
    /\b(pain|ache|bleed|swell|infection|abscess|root canal|cavity|symptom|diagnos|treat|medication|prescription|antibiotic|sore|numb|sensitive|loose tooth|gum|wisdom tooth|braces|filling|crown|extraction)\b/i;
  const isClinical = clinicalKeywords.test(patientMessage);

  return {
    extracted_fields: {},
    answer: isClinical
      ? "I'd like to connect you with one of our dentists to discuss that properly. Could you share your preferred date and time for a visit?"
      : "I'm sorry, I had trouble processing that. Could you please try again?",
    is_clinical_question: isClinical,
    is_ambiguous: true,
    confidence: 0,
    missing_required_fields: [...requiredFields],
  };
}

// ---------- prompt builder ---------------------------------------------------

function buildSystemPrompt(
  knowledgeContext: string,
  requiredFields: string[],
  fieldDefinitions?: Record<string, FieldDefinition>,
  conversationHistory?: string,
): string {
  const sections: string[] = [
    `You are an AI assistant for BrightSmile Dental Clinic. Your job is to:
1. Answer patient questions using ONLY the knowledge provided below
2. Extract structured information from patient messages
3. NEVER give medical advice (symptom analysis, diagnosis, treatment recommendations)
4. If the patient asks a clinical/medical question, set is_clinical_question to true and respond that a dentist will follow up
5. If the patient's response is vague or ambiguous (e.g., "maybe", "not sure", "I'll think about it", "later"), set is_ambiguous to true

TONE: Warm, professional, concise. You are a receptionist, not a doctor.
SAFETY: Never provide diagnosis, treatment plans, or medical opinions. If the patient describes symptoms or asks "what should I do?", set is_clinical_question to true and say a dentist will contact them.
CONFIDENCE GUIDELINES:
- 0.9-1.0: All required fields extracted clearly, message is unambiguous
- 0.7-0.89: Most fields extracted, minor ambiguity
- 0.4-0.69: Some fields extracted, significant ambiguity or missing info
- 0.1-0.39: Very little extracted, highly ambiguous
- 0.0: Complete failure to extract or parse

CLINIC KNOWLEDGE:
${knowledgeContext}

REQUIRED FIELDS TO EXTRACT:
${requiredFields.join(', ')}${formatFieldDefinitions(fieldDefinitions)}`,
  ];

  if (conversationHistory) {
    sections.push(
      `CONVERSATION HISTORY (earlier messages for context — do NOT re-extract already-confirmed fields unless the patient changes them):
${conversationHistory}`,
    );
  }

  sections.push(
    `You MUST respond with ONLY a valid JSON object (no markdown, no explanation outside JSON) with this exact structure:
{
  "extracted_fields": { ... extracted field values from the current message ... },
  "answer": "your response to the patient — warm, professional, and helpful",
  "is_clinical_question": false,
  "is_ambiguous": false,
  "confidence": 0.85,
  "missing_required_fields": ["list of required fields NOT found in the current message"]
}

RULES FOR extracted_fields:
- Only include fields that are actually present or can be reasonably inferred from the CURRENT message.
- Use null for a field if the patient explicitly says they don't know or don't have a preference.
- Do NOT carry forward fields from conversation history — the caller handles that.
- Normalize values (e.g., trim whitespace, lowercase enums if applicable).

RULES FOR answer:
- If is_clinical_question is true: "I want to make sure you get the best care. Let me connect you with one of our dentists who can help. What date and time works for you?"
- If is_ambiguous is true: acknowledge the ambiguity warmly and ask a clarifying question.
- Otherwise: answer the patient's question using the clinic knowledge, and if there are missing required fields, gently ask for them in a single message.
- Keep the answer under 200 characters when possible. Be conversational but concise.`,
  );

  return sections.join('\n\n');
}

// ---------- GeminiProvider ---------------------------------------------------

export class GeminiProvider implements AiProvider {
  private model: ReturnType<InstanceType<typeof GoogleGenerativeAI>['getGenerativeModel']> | null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[GeminiProvider] GEMINI_API_KEY is not configured; AI extraction will fall back to safe defaults.');
      this.model = null;
      return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.model = genAI.getGenerativeModel({ model: modelName });
  }

  async extractAndAnswer(
    patientMessage: string,
    knowledgeContext: string,
    requiredFields: string[],
    fieldDefinitions?: Record<string, FieldDefinition>,
    conversationHistory?: string,
  ): Promise<AIExtractionResult> {
    if (!this.model) {
      return buildFallbackResult(patientMessage, requiredFields, 'Gemini is not configured');
    }

    const systemPrompt = buildSystemPrompt(
      knowledgeContext,
      requiredFields,
      fieldDefinitions,
      conversationHistory,
    );

    let responseText: string;

    try {
      const result = await this.model.generateContent({
        systemInstruction: systemPrompt,
        contents: [{ role: 'user', parts: [{ text: patientMessage }] }],
      });

      responseText = result.response.text();
    } catch (err) {
      // Never leak API details or the prompt into error messages
      throw new Error(
        `AI provider request failed: ${(err as Error).message ?? 'unknown error'}`,
      );
    }

    // --- Parse the response ---
    const raw = extractJsonFromText(responseText);

    if (raw === null) {
      return buildFallbackResult(
        patientMessage,
        requiredFields,
        'Response was not valid JSON',
      );
    }

    // --- Zod validation ---
    const parseResult = aiExtractionSchema.safeParse(raw);

    if (!parseResult.success) {
      // If Zod rejects it, attempt a manual repair before falling back
      const repaired = attemptRepair(raw, requiredFields);
      const repairResult = aiExtractionSchema.safeParse(repaired);

      if (!repairResult.success) {
        return buildFallbackResult(
          patientMessage,
          requiredFields,
          'Schema validation failed after repair attempt',
        );
      }

      const repairedResult = repairResult.data as AIExtractionResult;
      repairedResult.extracted_fields = sanitizeEnumFields(
        repairedResult.extracted_fields,
        fieldDefinitions,
      );
      return repairedResult;
    }

    const finalResult = parseResult.data as AIExtractionResult;
    finalResult.extracted_fields = sanitizeEnumFields(
      finalResult.extracted_fields,
      fieldDefinitions,
    );
    return finalResult;
  }
}

// ---------- repair helpers ---------------------------------------------------

/**
 * Attempt to coerce common model mistakes into a shape that passes the schema.
 */
function attemptRepair(
  raw: Record<string, unknown>,
  requiredFields: string[],
): Record<string, unknown> {
  const repaired: Record<string, unknown> = {
    extracted_fields: {},
    answer: '',
    is_clinical_question: false,
    is_ambiguous: false,
    confidence: 0,
    missing_required_fields: [] as string[],
  };

  // extracted_fields — must be a plain object
  if (
    raw.extracted_fields !== null &&
    raw.extracted_fields !== undefined &&
    typeof raw.extracted_fields === 'object' &&
    !Array.isArray(raw.extracted_fields)
  ) {
    repaired.extracted_fields = raw.extracted_fields as Record<string, unknown>;
  }

  // answer — must be a string, capped at 2000 chars
  if (typeof raw.answer === 'string') {
    repaired.answer = raw.answer.slice(0, 2000);
  }

  // is_clinical_question
  if (typeof raw.is_clinical_question === 'boolean') {
    repaired.is_clinical_question = raw.is_clinical_question;
  } else if (raw.is_clinical_question === 'true' || raw.is_clinical_question === 1) {
    repaired.is_clinical_question = true;
  }

  // is_ambiguous
  if (typeof raw.is_ambiguous === 'boolean') {
    repaired.is_ambiguous = raw.is_ambiguous;
  } else if (raw.is_ambiguous === 'true' || raw.is_ambiguous === 1) {
    repaired.is_ambiguous = true;
  }

  // confidence — must be 0-1 number
  if (typeof raw.confidence === 'number' && isFinite(raw.confidence)) {
    repaired.confidence = Math.max(0, Math.min(1, raw.confidence));
  }

  // missing_required_fields — must be string array
  if (Array.isArray(raw.missing_required_fields)) {
    repaired.missing_required_fields = raw.missing_required_fields
      .filter((v) => typeof v === 'string')
      .map(String);
  }

  // Cross-check: any required field not in extracted_fields should appear in missing_required_fields
  const extractedKeys = new Set(Object.keys(repaired.extracted_fields as Record<string, unknown>));
  const currentlyMissing = requiredFields.filter((f) => !extractedKeys.has(f));
  if (currentlyMissing.length > 0) {
    const existingMissing = new Set(repaired.missing_required_fields as string[]);
    for (const field of currentlyMissing) {
      if (!existingMissing.has(field)) {
        (repaired.missing_required_fields as string[]).push(field);
      }
    }
  }

  return repaired;
}