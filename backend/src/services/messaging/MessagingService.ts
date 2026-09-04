import { MessagingProvider, SendMessageResult } from './MessagingProvider';
import { ErrorLogRepository } from '../../repositories';

export class MessagingService {
  private provider: MessagingProvider;
  private errorLogRepo: ErrorLogRepository;

  constructor(provider: MessagingProvider, errorLogRepo: ErrorLogRepository) {
    this.provider = provider;
    this.errorLogRepo = errorLogRepo;
  }

  async sendMessage(to: string, message: string, patientId?: string): Promise<SendMessageResult> {
    try {
      return await this.provider.sendMessage(to, message);
    } catch (error) {
      await this.errorLogRepo.create({
        patient_id: patientId,
        service: 'messaging',
        operation: 'sendMessage',
        error_message: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: 'Failed to send message' };
    }
  }

  async sendTemplate(to: string, templateName: string, patientId?: string, parameters?: string[]): Promise<SendMessageResult> {
    try {
      return await this.provider.sendTemplate(to, templateName, parameters);
    } catch (error) {
      await this.errorLogRepo.create({
        patient_id: patientId,
        service: 'messaging',
        operation: 'sendTemplate',
        error_message: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: 'Failed to send template message' };
    }
  }
}
