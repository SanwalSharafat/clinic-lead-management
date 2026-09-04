import { Request, Response } from 'express';
import { WorkflowService } from '../services/workflow';
import { transformMetaWebhookPayload } from '../services/messaging/metaWebhookTransformer';

export class WebhookController {
  private workflowService: WorkflowService;

  constructor(workflowService: WorkflowService) {
    this.workflowService = workflowService;
  }

  // POST /webhook/whatsapp
  async handleWhatsAppMessage(req: Request, res: Response): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] 📨 WEBHOOK RECEIVED - WhatsApp Message`);
    console.log('[REQUEST BODY]', JSON.stringify(req.body, null, 2));

    try {
      // Transform Meta's payload to our internal format
      console.log('[TRANSFORMING] Converting Meta payload...');
      if (
        !req.body ||
        typeof req.body !== 'object' ||
        req.body.object !== 'whatsapp_business_account'
      ) {
        res.status(400).json({ success: false, error: 'Invalid WhatsApp message payload' });
        return;
      }
      const transformed = transformMetaWebhookPayload(req.body);
      
      if (!transformed) {
        console.log('[INFO] Webhook received but not a message (might be status update)');
        res.status(200).json({ success: true, message: 'Webhook acknowledged' });
        return;
      }

      console.log('[TRANSFORMED]', transformed);
      console.log('[PROCESSING] Starting workflow service...');
      const result = await this.workflowService.processWhatsAppMessage(transformed);
      console.log(`[✅ SUCCESS] Message processed. Action: ${result.action_taken}`);
      console.log('[RESULT]', JSON.stringify(result, null, 2));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[❌ ERROR] Failed to process WhatsApp message: ${message}`);
      console.error('[ERROR STACK]', error instanceof Error ? error.stack : error);
      res.status(400).json({ success: false, error: message });
    }
  }

  // GET /webhook/whatsapp (for WATI verification)
  async verifyWebhook(req: Request, res: Response): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] 🔐 WEBHOOK VERIFICATION REQUEST`);
    console.log('[QUERY PARAMS]', req.query);

    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.WEBHOOK_VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log(`[VERIFICATION] Mode: ${mode}, Has Token: ${!!token}, Has Challenge: ${!!challenge}`);
    console.log(`[TOKEN CHECK] Expected: ${verifyToken}, Received: ${token}, Match: ${token === verifyToken}`);

    if (mode === 'subscribe' && token === verifyToken) {
      console.log(`[✅ VERIFIED] Webhook verification successful`);
      res.status(200).send(challenge);
    } else {
      console.log(`[❌ REJECTED] Token mismatch or invalid mode`);
      res.status(403).send('Forbidden');
    }
  }

  // POST /webhook/form
  async handleFormSubmission(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.workflowService.processFormSubmission(req.body);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  }
}
