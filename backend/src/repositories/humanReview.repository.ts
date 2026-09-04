import { supabase } from '../lib/supabase';
import type { HumanReviewRow } from '../types';
import { ReviewReason } from '../types';

export class HumanReviewRepository {
  async create(data: {
    patient_id: string;
    reason: ReviewReason;
    ai_output?: Record<string, unknown>;
  }): Promise<HumanReviewRow> {
    const insertPayload: Record<string, unknown> = {
      patient_id: data.patient_id,
      reason: data.reason,
      resolved: false,
    };

    if (data.ai_output !== undefined && data.ai_output !== null) {
      insertPayload['ai_output'] = data.ai_output;
    }

    const { data: row, error } = await supabase
      .from('human_reviews')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create human review: ${error.message}`);
    }

    return row as HumanReviewRow;
  }

  async findById(id: string): Promise<HumanReviewRow | null> {
    const { data, error } = await supabase
      .from('human_reviews')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to find human review by id [${id}]: ${error.message}`,
      );
    }

    return data ? (data as HumanReviewRow) : null;
  }

  async resolve(
    id: string,
    data: {
      human_decision: string;
      human_notes?: string;
      reviewer_id: string;
    },
  ): Promise<HumanReviewRow> {
    const updatePayload: Record<string, unknown> = {
      human_decision: data.human_decision,
      reviewer_id: data.reviewer_id,
      resolved: true,
      resolved_at: new Date().toISOString(),
    };

    if (data.human_notes !== undefined && data.human_notes !== null) {
      updatePayload['human_notes'] = data.human_notes;
    }

    const { data: row, error } = await supabase
      .from('human_reviews')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(
        `Failed to resolve human review [${id}]: ${error.message}`,
      );
    }

    return row as HumanReviewRow;
  }

  async list(filters?: {
    resolved?: boolean;
    reason?: ReviewReason;
    limit?: number;
    offset?: number;
  }): Promise<HumanReviewRow[]> {
    let query = supabase.from('human_reviews').select('*');

    if (filters?.resolved !== undefined) {
      query = query.eq('resolved', filters.resolved);
    }

    if (filters?.reason) {
      query = query.eq('reason', filters.reason);
    }

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list human reviews: ${error.message}`);
    }

    return (data ?? []) as HumanReviewRow[];
  }

  async findOpenByPatientId(patient_id: string): Promise<HumanReviewRow | null> {
    const { data, error } = await supabase
      .from('human_reviews')
      .select('*')
      .eq('patient_id', patient_id)
      .eq('resolved', false)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to find open review for patient [${patient_id}]: ${error.message}`,
      );
    }

    return data ? (data as HumanReviewRow) : null;
  }
}

export const humanReviewRepository = new HumanReviewRepository();
