process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'example-service-role-key';
process.env.GEMINI_API_KEY ??= 'example-gemini-key';
process.env.WATI_API_KEY ??= 'example-wati-key';
process.env.WATI_PHONE_NUMBER ??= '+15551234567';
process.env.WEBHOOK_VERIFY_TOKEN ??= 'test-verify-token';
process.env.GOOGLE_CALENDAR_CLIENT_ID ??= 'example-google-client-id';
process.env.GOOGLE_CALENDAR_CLIENT_SECRET ??= 'example-google-client-secret';
process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ??= 'example-google-refresh-token';

import type { AddressInfo } from 'net';

const { app } = require('../src/app');

describe('API endpoint smoke tests', () => {
  let server: { close: (callback?: () => void) => void; address: () => AddressInfo | string | null };

  beforeAll((done) => {
    server = app.listen(0, done);
  });

  afterAll((done) => {
    server.close(done);
  });

  const getBaseUrl = () => {
    const address = server.address();
    if (typeof address === 'string' || address === null) {
      throw new Error('Server did not bind to a TCP port');
    }
    return `http://127.0.0.1:${address.port}`;
  };

  it('GET /health returns ok status', async () => {
    const response = await fetch(`${getBaseUrl()}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
  });

  it('GET /webhook/whatsapp returns the challenge when verified', async () => {
    const verifyUrl = `${getBaseUrl()}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=test-challenge`;
    const response = await fetch(verifyUrl);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('test-challenge');
  });

  it('POST /webhook/whatsapp rejects invalid payloads', async () => {
    const response = await fetch(`${getBaseUrl()}/webhook/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Invalid WhatsApp message'),
    });
  });
});
