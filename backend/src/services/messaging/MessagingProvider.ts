import type { SendMessageResult } from '../../types';  export type { SendMessageResult };  export interface MessagingProvider {
  sendMessage(to: string, message: string): Promise<SendMessageResult>;
  sendTemplate(to: string, templateName: string, parameters?: string[]): Promise<SendMessageResult>;
}
