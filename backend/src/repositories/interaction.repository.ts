import { supabase } from '../lib/supabase';
import type { InteractionRow } from '../types';
import { Channel, MessageDirection } from '../types';

export class InteractionRepository {
  async findByExternalId(external_message_id: string): Promise<InteractionRow | null> {
    const { data, error } = await supabase
      .from('interactions')
      .select('*')
      .eq('external_message_id', external_message_id)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to find interaction by external_message_id [${external_message_id}]: ${error.message}`,
      );
    }

    return data ? (data as InteractionRow) : null;
  }

  async create(data: {
    patient_id: string;
    channel: Channel;
    message: string;
    direction: MessageDirection;
    external_message_id?: string;
  }): Promise<InteractionRow> {
    const insertPayload: Record<string, unknown> = {
      patient_id: data.patient_id,
      channel: data.channel,
      message: data.message,
      direction: data.direction,
    };

    if (data.external_message_id !== undefined && data.external_message_id !== null) {
      insertPayload['external_message_id'] = data.external_message_id;
    }

    const { data: row, error } = await supabase
      .from('interactions')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create interaction: ${error.message}`);
    }

    return row as InteractionRow;
  }

  async getByPatientId(patient_id: string): Promise<InteractionRow[]> {
    const { data, error } = await supabase
      .from('interactions')
      .select('*')
      .eq('patient_id', patient_id)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(
        `Failed to fetch interactions for patient [${patient_id}]: ${error.message}`,
      );
    }

    return (data ?? []) as InteractionRow[];
  }
}

export const interactionRepository = new InteractionRepository();
