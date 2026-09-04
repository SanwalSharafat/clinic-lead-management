import { supabase } from '../lib/supabase';
import type { ErrorLogRow } from '../types';

export class ErrorLogRepository {
  async create(data: {
    patient_id?: string;
    service: string;
    operation: string;
    error_message: string;
    retry_count?: number;
  }): Promise<ErrorLogRow> {
    const insertPayload: Record<string, unknown> = {
      service: data.service,
      operation: data.operation,
      error_message: data.error_message,
      retry_count: data.retry_count ?? 0,
    };

    if (data.patient_id !== undefined && data.patient_id !== null) {
      insertPayload['patient_id'] = data.patient_id;
    }

    const { data: row, error } = await supabase
      .from('error_logs')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create error log: ${error.message}`);
    }

    return row as ErrorLogRow;
  }
}

export const errorLogRepository = new ErrorLogRepository();
