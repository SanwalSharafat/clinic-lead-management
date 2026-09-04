import { supabase } from '../lib/supabase';
import type { ClinicConfigRow } from '../types';

export class ClinicConfigRepository {
  async getActiveConfig(): Promise<ClinicConfigRow> {
    const { data, error } = await supabase
      .from('clinic_config')
      .select('*')
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('No active clinic configuration found');
      }
      throw new Error(`Failed to fetch active clinic config: ${error.message}`);
    }

    return data as ClinicConfigRow;
  }

  async getConfigById(id: string): Promise<ClinicConfigRow | null> {
    const { data, error } = await supabase
      .from('clinic_config')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch clinic config by id [${id}]: ${error.message}`);
    }

    return data ? (data as ClinicConfigRow) : null;
  }

  async createConfig(data: Omit<ClinicConfigRow, 'id' | 'created_at'>): Promise<ClinicConfigRow> {
    const { data: row, error } = await supabase
      .from('clinic_config')
      .insert(data)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create clinic config: ${error.message}`);
    }

    return row as ClinicConfigRow;
  }

  async deactivateConfig(id: string): Promise<void> {
    const { error } = await supabase
      .from('clinic_config')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to deactivate clinic config [${id}]: ${error.message}`);
    }
  }
}

export const clinicConfigRepository = new ClinicConfigRepository();
