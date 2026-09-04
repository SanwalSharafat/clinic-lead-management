import { supabase } from '../lib/supabase';
import type { AppointmentRow } from '../types';
import { AppointmentStatus } from '../types';

export class AppointmentRepository {
  async create(data: {
    patient_id: string;
    scheduled_time: string;
    calendar_event_id?: string;
  }): Promise<AppointmentRow> {
    const insertPayload: Record<string, unknown> = {
      patient_id: data.patient_id,
      scheduled_time: data.scheduled_time,
      status: AppointmentStatus.SCHEDULED,
    };

    if (data.calendar_event_id !== undefined && data.calendar_event_id !== null) {
      insertPayload['calendar_event_id'] = data.calendar_event_id;
    }

    const { data: row, error } = await supabase
      .from('appointments')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create appointment: ${error.message}`);
    }

    return row as AppointmentRow;
  }

  async findByPatientId(patient_id: string): Promise<AppointmentRow[]> {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_id', patient_id)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(
        `Failed to fetch appointments for patient [${patient_id}]: ${error.message}`,
      );
    }

    return (data ?? []) as AppointmentRow[];
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<void> {
    const { error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', id);

    if (error) {
      throw new Error(
        `Failed to update appointment status [${id}] to ${status}: ${error.message}`,
      );
    }
  }
}

export const appointmentRepository = new AppointmentRepository();
