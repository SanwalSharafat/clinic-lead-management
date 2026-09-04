import { MessagingProvider, SendMessageResult } from './MessagingProvider';

export class WatiProvider implements MessagingProvider {
  private appId: string;
  private appSecret: string;
  private accessToken: string;
  private baseUrl: string;
  private phoneNumberId: string;

  constructor() {
    this.appId = process.env.WHATSAPP_APP_ID || process.env.WATI_APP_ID || '';
    this.appSecret = process.env.WHATSAPP_APP_SECRET || process.env.WATI_APP_SECRET || '';
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WATI_API_KEY || '';
    this.baseUrl = (process.env.WHATSAPP_API_BASE_URL || process.env.WATI_BASE_URL || 'https://graph.facebook.com/v19.0').replace(/\/+$/, '');
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WATI_PHONE_NUMBER || '';
  }

  private formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (!digits) {
      return '';
    }

    return digits.startsWith('00') ? digits.slice(2) : digits;
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private getConfigError(): string {
    return 'WhatsApp direct app credentials are not configured. Set WHATSAPP_APP_ID, WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN, and WHATSAPP_PHONE_NUMBER_ID in .env.';
  }

  private hasRequiredConfig(): boolean {
    return Boolean(this.appId && this.appSecret && this.accessToken && this.phoneNumberId);
  }

  async sendMessage(to: string, message: string): Promise<SendMessageResult> {
    if (!this.hasRequiredConfig()) {
      console.warn('[WatiProvider] WhatsApp direct credentials not configured; skipping outbound message.');
      return { success: false, error: this.getConfigError() };
    }

    const timestamp = new Date().toISOString();
    const formattedPhone = this.formatPhone(to);
    
    console.log(`\n[${timestamp}] 📤 SENDING MESSAGE`);
    console.log(`[TO] ${to} → ${formattedPhone}`);
    console.log(`[MESSAGE] ${message}`);
    console.log(`[API URL] ${this.baseUrl}/${this.phoneNumberId}/messages`);

    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
      const body = JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: {
          body: message,
        },
      });

      console.log(`[PAYLOAD] ${body}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body,
      });

      console.log(`[RESPONSE STATUS] ${response.status} ${response.statusText}`);

      if (!response.ok) {
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json() as Record<string, unknown>;
          console.log(`[ERROR BODY] ${JSON.stringify(errorBody, null, 2)}`);
          const detail = (errorBody.error as Record<string, unknown> | undefined)?.message;
          if (typeof detail === 'string') {
            errorDetail = detail;
          } else if (typeof errorBody.message === 'string') {
            errorDetail = errorBody.message;
          }
        } catch {
          // Could not parse error body; use default status text
        }
        console.error(`[❌ SEND FAILED] ${errorDetail}`);
        return { success: false, error: errorDetail };
      }

      const data = await response.json() as Record<string, unknown>;
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const externalId = typeof messages[0]?.id === 'string' ? messages[0].id : typeof data.id === 'string' ? data.id : undefined;

      console.log(`[✅ SENT] Message ID: ${externalId}`);
      console.log(`[RESPONSE DATA] ${JSON.stringify(data, null, 2)}`);
      
      return { success: true, external_message_id: externalId };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown network error';
      console.error(`[❌ NETWORK ERROR] ${errorMsg}`);
      console.error('[STACK]', error instanceof Error ? error.stack : error);
      return { success: false, error: errorMsg };
    }
  }

  async sendTemplate(to: string, templateName: string, parameters?: string[]): Promise<SendMessageResult> {
    if (!this.hasRequiredConfig()) {
      console.warn('[WatiProvider] WhatsApp direct credentials not configured; skipping outbound template message.');
      return { success: false, error: this.getConfigError() };
    }

    try {
      const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
      const preparedParameters = (parameters ?? []).map((parameter) => ({ type: 'text', text: parameter }));
      const body = JSON.stringify({
        messaging_product: 'whatsapp',
        to: this.formatPhone(to),
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en_US' },
          ...(preparedParameters.length > 0 ? { components: [{ type: 'body', parameters: preparedParameters }] } : {}),
        },
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body,
      });

      if (!response.ok) {
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json() as Record<string, unknown>;
          const detail = (errorBody.error as Record<string, unknown> | undefined)?.message;
          if (typeof detail === 'string') {
            errorDetail = detail;
          } else if (typeof errorBody.message === 'string') {
            errorDetail = errorBody.message;
          }
        } catch {
          // Could not parse error body; use default status text
        }
        return { success: false, error: errorDetail };
      }

      const data = await response.json() as Record<string, unknown>;
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const externalId = typeof messages[0]?.id === 'string' ? messages[0].id : typeof data.id === 'string' ? data.id : undefined;

      return { success: true, external_message_id: externalId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      return { success: false, error: message };
    }
  }
}
