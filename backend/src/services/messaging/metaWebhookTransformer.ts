// ========================================
// Meta Webhook Payload Transformer
// Converts Meta's WhatsApp Cloud API format to our internal schema
// ========================================

/**
 * Meta sends webhooks in this format:
 * {
 *   "object": "whatsapp_business_account",
 *   "entry": [
 *     {
 *       "changes": [
 *         {
 *           "value": {
 *             "messages": [
 *               {
 *                 "from": "1234567890",
 *                 "id": "wamid.xxx",
 *                 "text": { "body": "Hello" }
 *               }
 *             ]
 *           }
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * We need to transform it to:
 * {
 *   "phone": "+1234567890",
 *   "message": "Hello",
 *   "external_message_id": "wamid.xxx"
 * }
 */

export interface MetaWebhookPayload {
  object: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: {
          phone_number_id?: string;
          display_phone_number?: string;
        };
        messages?: Array<{
          from: string;
          id: string;
          timestamp?: string;
          type: string;
          text?: {
            body: string;
          };
          image?: {
            mime_type?: string;
            sha256?: string;
            id?: string;
          };
          button?: unknown;
          interactive?: unknown;
        }>;
        statuses?: Array<unknown>;
      };
    }>;
  }>;
}

export interface TransformedWhatsAppMessage {
  phone: string;
  message: string;
  external_message_id: string;
  timestamp?: string;
}

/**
 * Transform Meta's webhook payload to our internal format
 * Handles edge cases: multiple messages, missing fields, invalid data
 */
export function transformMetaWebhookPayload(
  payload: unknown
): TransformedWhatsAppMessage | null {
  // Validate it's an object
  if (!payload || typeof payload !== 'object') {
    console.warn('[Transformer] Payload is not an object');
    return null;
  }

  const meta = payload as MetaWebhookPayload;

  // Check for object type
  if (meta.object !== 'whatsapp_business_account') {
    console.warn(`[Transformer] Unknown object type: ${meta.object}`);
    return null;
  }

  // Extract entries
  if (!Array.isArray(meta.entry) || meta.entry.length === 0) {
    console.warn('[Transformer] No entries in webhook');
    return null;
  }

  const entry = meta.entry[0];
  if (entry === undefined) {
    console.warn('[Transformer] Entry is undefined');
    return null;
  }

  if (!Array.isArray(entry.changes) || entry.changes.length === 0) {
    console.warn('[Transformer] No changes in entry');
    return null;
  }

  const change = entry.changes[0];
  if (change === undefined) {
    console.warn('[Transformer] Change is undefined');
    return null;
  }

  const value = change.value;
  if (!value) {
    console.warn('[Transformer] No value in change');
    return null;
  }

  // Look for messages
  if (!Array.isArray(value.messages) || value.messages.length === 0) {
    console.log('[Transformer] No messages in webhook (might be status update)');
    return null;
  }

  const msg = value.messages[0];
  if (msg === undefined) {
    console.warn('[Transformer] Message is undefined');
    return null;
  }

  // Extract data - at this point msg is guaranteed to exist
  const phone: string = msg.from;
  const externalMessageId: string = msg.id;
  const timestamp: string | undefined = msg.timestamp;

  // Extract message text
  let messageText = '';
  const msgType: string = msg.type;

  if (msgType === 'text' && msg.text && msg.text.body) {
    messageText = msg.text.body;
  } else if (msgType === 'image' && msg.image) {
    messageText = '[Image message received]';
  } else if (msgType === 'button') {
    messageText = '[Button message received]';
  } else if (msgType === 'interactive') {
    messageText = '[Interactive message received]';
  } else {
    messageText = `[${msgType} message received]`;
  }

  if (!phone || !externalMessageId) {
    console.warn('[Transformer] Missing phone or message ID');
    return null;
  }

  // Format phone to E.164 if needed
  const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

  console.log('[Transformer] Successfully transformed:');
  console.log(`  From: ${phone} → ${formattedPhone}`);
  console.log(`  Message: ${messageText}`);
  console.log(`  ID: ${externalMessageId}`);

  return {
    phone: formattedPhone,
    message: messageText,
    external_message_id: externalMessageId,
    timestamp,
  };
}
