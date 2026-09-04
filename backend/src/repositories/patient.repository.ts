import { supabase } from '../lib/supabase';
import type { PatientRow } from '../types';
import { Channel, PatientStatus, ScoreTier } from '../types';

export class PatientRepository {
  async findByPhone(phone: string): Promise<PatientRow | null> {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find patient by phone [${phone}]: ${error.message}`);
    }

    return data ? (data as PatientRow) : null;
  }

  async findById(id: string): Promise<PatientRow | null> {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find patient by id [${id}]: ${error.message}`);
    }

    return data ? (data as PatientRow) : null;
  }

  async create(data: {
    phone: string;
    source: Channel;
    name?: string;
    email?: string;
    raw_message?: string;
    extracted_fields?: Record<string, unknown>;
  }): Promise<PatientRow> {
    const insertPayload: Record<string, unknown> = {
      phone: data.phone,
      source: data.source,
      status: PatientStatus.NEW_LEAD,
      attempt_count: 0,
      opted_out: false,
    };

    if (data.name !== undefined && data.name !== null) {
      insertPayload['name'] = data.name;
    }
    if (data.email !== undefined && data.email !== null) {
      insertPayload['email'] = data.email;
    }
    if (data.raw_message !== undefined && data.raw_message !== null) {
      insertPayload['raw_message'] = data.raw_message;
    }
    if (data.extracted_fields !== undefined && data.extracted_fields !== null) {
      insertPayload['extracted_fields'] = data.extracted_fields;
    }

    const { data: row, error } = await supabase
      .from('patients')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create patient: ${error.message}`);
    }

    return row as PatientRow;
  }

  async update(id: string, data: Partial<PatientRow>): Promise<PatientRow> {
    const updatePayload: Record<string, unknown> = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    const { data: row, error } = await supabase
      .from('patients')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update patient [${id}]: ${error.message}`);
    }

    return row as PatientRow;
  }

  async updateExtractedFields(
    id: string,
    newFields: Record<string, unknown>,
  ): Promise<PatientRow> {
    // First, fetch the current patient to get existing extracted_fields
    const { data: existing, error: fetchError } = await supabase
      .from('patients')
      .select('extracted_fields')
      .eq('id', id)
      .single();

    if (fetchError) {
      throw new Error(
        `Failed to fetch existing fields for patient [${id}]: ${fetchError.message}`,
      );
    }

    const currentFields = (existing?.['extracted_fields'] as Record<string, unknown>) ?? {};

    // MERGE: only overwrite keys that have a non-null, non-undefined value
    const merged = { ...currentFields };
    for (const [key, value] of Object.entries(newFields)) {
      if (value !== null && value !== undefined) {
        merged[key] = value;
      }
    }

    const { data: row, error } = await supabase
      .from('patients')
      .update({
        extracted_fields: merged,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(
        `Failed to update extracted fields for patient [${id}]: ${error.message}`,
      );
    }

    return row as PatientRow;
  }

  async updateStatus(id: string, status: PatientStatus): Promise<void> {
    const { error } = await supabase
      .from('patients')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new Error(
        `Failed to update patient status [${id}] to ${status}: ${error.message}`,
      );
    }
  }

  async updateScore(id: string, score: number, tier: ScoreTier): Promise<void> {
    const { error } = await supabase
      .from('patients')
      .update({
        lead_score: score,
        score_tier: tier,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new Error(
        `Failed to update score for patient [${id}]: ${error.message}`,
      );
    }
  }

  async incrementAttemptCount(id: string): Promise<PatientRow> {
    // Fetch current count first, then set incremented value
    const { data: existing, error: fetchError } = await supabase
      .from('patients')
      .select('attempt_count')
      .eq('id', id)
      .single();

    if (fetchError) {
      throw new Error(
        `Failed to fetch attempt count for patient [${id}]: ${fetchError.message}`,
      );
    }

    const currentCount = (existing?.['attempt_count'] as number) ?? 0;

    const { data: row, error } = await supabase
      .from('patients')
      .update({
        attempt_count: currentCount + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(
        `Failed to increment attempt count for patient [${id}]: ${error.message}`,
      );
    }

    return row as PatientRow;
  }

  async setOptedOut(phone: string): Promise<void> {
    const { error } = await supabase
      .from('patients')
      .update({
        opted_out: true,
        status: PatientStatus.OPTED_OUT,
        updated_at: new Date().toISOString(),
      })
      .eq('phone', phone);

    if (error) {
      throw new Error(
        `Failed to set opted out for phone [${phone}]: ${error.message}`,
      );
    }
  }

  async isOptedOut(phone: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('patients')
      .select('id')
      .eq('phone', phone)
      .eq('opted_out', true)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to check opted-out status for phone [${phone}]: ${error.message}`,
      );
    }

    return data !== null;
  }

  async list(filters?: {
    status?: PatientStatus;
    score_tier?: ScoreTier;
    limit?: number;
    offset?: number;
  }): Promise<PatientRow[]> {
    let query = supabase.from('patients').select('*');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.score_tier) {
      query = query.eq('score_tier', filters.score_tier);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(
        filters.offset,
        filters.offset + (filters?.limit ?? 20) - 1,
      );
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list patients: ${error.message}`);
    }

    return (data ?? []) as PatientRow[];
  }
}

export const patientRepository = new PatientRepository();
