import { Request, Response } from 'express';
import { PatientRepository, AppointmentRepository, InteractionRepository } from '../repositories';
import { PatientStatus, ScoreTier } from '../types';
import { patientOutcomeSchema } from '../validators/schemas';

function isZodError(error: unknown): error is { issues: unknown[] } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown }).issues)
  );
}

export class PatientController {
  private patientRepo: PatientRepository;
  private appointmentRepo: AppointmentRepository;
  private interactionRepo: InteractionRepository;

  constructor(
    patientRepo: PatientRepository,
    appointmentRepo: AppointmentRepository,
    interactionRepo: InteractionRepository,
  ) {
    this.patientRepo = patientRepo;
    this.appointmentRepo = appointmentRepo;
    this.interactionRepo = interactionRepo;
  }

  // GET /patients
  async listPatients(req: Request, res: Response): Promise<void> {
    try {
      const filters = {
        status: req.query.status as PatientStatus | undefined,
        score_tier: req.query.score_tier as ScoreTier | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };
      const patients = await this.patientRepo.list(filters);
      res.status(200).json({ success: true, data: patients });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // GET /patients/:id
  async getPatient(req: Request, res: Response): Promise<void> {
    try {
      const patient = await this.patientRepo.findById(req.params.id!);
      if (!patient) {
        res.status(404).json({ success: false, error: 'Patient not found' });
        return;
      }
      const appointments = await this.appointmentRepo.findByPatientId(patient.id);
      const interactions = await this.interactionRepo.getByPatientId(patient.id);
      res.status(200).json({ success: true, data: { patient, appointments, interactions } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // POST /patients/:id/won
  async markWon(req: Request, res: Response): Promise<void> {
    try {
      patientOutcomeSchema.parse(req.body);
      const patient = await this.patientRepo.findById(req.params.id!);
      if (!patient) {
        res.status(404).json({ success: false, error: 'Patient not found' });
        return;
      }
      await this.patientRepo.updateStatus(req.params.id!, PatientStatus.WON);
      const updated = await this.patientRepo.findById(req.params.id!);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      if (isZodError(error)) {
        res.status(400).json({ success: false, error: 'Validation error', details: error });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }

  // POST /patients/:id/lost
  async markLost(req: Request, res: Response): Promise<void> {
    try {
      patientOutcomeSchema.parse(req.body);
      const patient = await this.patientRepo.findById(req.params.id!);
      if (!patient) {
        res.status(404).json({ success: false, error: 'Patient not found' });
        return;
      }
      await this.patientRepo.updateStatus(req.params.id!, PatientStatus.LOST);
      const updated = await this.patientRepo.findById(req.params.id!);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      if (isZodError(error)) {
        res.status(400).json({ success: false, error: 'Validation error', details: error });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  }
}
