# Clinic Lead Management

An AI-assisted lead management system for a dental or medical clinic. The platform receives patient inquiries, extracts structured information with Gemini, scores and routes leads, supports human review, and manages appointment availability.

## Architecture

The system is split into two layers:

- **Knowledge layer** — Markdown files in `backend/knowledge/` provide clinic context for AI prompts.
- **Decision layer** — Gemini extracts fields and detects intent; deterministic TypeScript services handle scoring, routing, review escalation, booking checks, and messaging.

The backend is organized into controllers, services, repositories, validators, and shared types. The frontend consumes the backend API through React Query hooks and can run against built-in mock data when the backend isn't available.

## Project structure

| Path | Description |
|---|---|
| [`backend/`](./backend) | Express + TypeScript API, workflow services, integrations, database access, and tests |
| [`clinic-dashboard/`](./clinic-dashboard) | React + Vite staff dashboard |

See [`backend/README.md`](./backend/README.md) and [`clinic-dashboard/README.md`](./clinic-dashboard/README.md) for component-specific details.

> For more detail on either side of the app, refer to the `backend/` and `clinic-dashboard/` folders directly — each has its own README covering setup, structure, and commands specific to that part of the project.

## Requirements

- Node.js 18 or newer
- npm
- A Supabase project
- A Gemini API key
- Optional: Meta WhatsApp Business credentials and Google Calendar credentials, for live integrations

## Getting started

### 1. Install dependencies

```bash
cd backend
npm install

cd ../clinic-dashboard
npm install
```

### 2. Configure environment variables

```bash
cd ../backend
copy .env.example .env

cd ../clinic-dashboard
copy .env.example .env
```

Backend `.env`, at minimum:

```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
WEBHOOK_VERIFY_TOKEN=your-webhook-token
```

Frontend `.env`:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_USE_MOCK_DATA=false
```

> Never commit a populated `.env` file or paste real keys into documentation or issue trackers. Treat every value above as a secret.

### 3. Set up the database

1. Create a Supabase project.
2. Open the Supabase SQL Editor and run [`backend/migrations/001_initial_schema.sql`](./backend/migrations/001_initial_schema.sql).
3. Add the Supabase URL and service role key to `backend/.env`.
4. Seed the clinic configuration:

   ```bash
   cd backend
   npm run seed
   ```

### 4. Run the applications

```bash
# Terminal 1
cd backend
npm run dev
```

```bash
# Terminal 2
cd clinic-dashboard
npm run dev
```

Open `http://localhost:5173`. Verify the API is up:

```bash
curl http://localhost:3000/health
```

## Optional integrations

The backend starts fine without WhatsApp or Google Calendar credentials. Add the relevant values from `backend/.env.example` when you're ready to enable:

- Meta WhatsApp Business webhooks and outbound messages
- Google Calendar availability and appointment creation
- Additional staff notification settings

## WhatsApp integration

### How it works

Meta's webhook payload doesn't match the internal message schema the backend expects, so incoming messages are transformed before validation.

Meta sends:

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "changes": [
        {
          "value": {
            "messages": [
              { "from": "1234567890", "id": "wamid.xxx", "text": { "body": "Hello" } }
            ]
          }
        }
      ]
    }
  ]
}
```

The transformer (`backend/src/services/messaging/metaWebhookTransformer.ts`) converts this to:

```json
{
  "phone": "+1234567890",
  "message": "Hello",
  "external_message_id": "wamid.xxx"
}
```

`webhookController.ts` applies the transform, then hands the message to `workflowService.ts` for processing and, ultimately, a reply via `WatiProvider.ts`. Each stage logs its input and output, so a failed or silent message can be traced to the specific step that dropped it.

### Local testing

1. **Start the backend**

   ```bash
   cd backend
   npm run dev
   ```

   Confirm it's listening on port 3000:

   ```bash
   curl http://localhost:3000/health
   ```

2. **Open a tunnel** (in a second terminal)

   ```bash
   ngrok http 3000
   ```

   Copy the HTTPS forwarding URL.

3. **Configure the Meta webhook**

   In the [Meta App Dashboard](https://developers.facebook.com/apps), under your WhatsApp Business app → **WhatsApp > Configuration**:

   - Callback URL: `https://YOUR_NGROK_HOST/webhook/whatsapp`
   - Verify token: the value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in `backend/.env`
   - Verify and save, then subscribe the webhook to the `messages` field

   Use your own app and phone number IDs — never reuse identifiers from documentation or examples in a live configuration.

4. **Send a test message** from the Meta dashboard, or POST a sample payload directly:

   ```bash
   curl -X POST http://localhost:3000/webhook/whatsapp \
     -H "Content-Type: application/json" \
     -d '{
       "object": "whatsapp_business_account",
       "entry": [{
         "id": "TEST_BUSINESS_ACCOUNT_ID",
         "changes": [{
           "value": {
             "messaging_product": "whatsapp",
             "metadata": { "display_phone_number": "TEST_DISPLAY_NUMBER", "phone_number_id": "TEST_PHONE_NUMBER_ID" },
             "messages": [{ "from": "15551234567", "id": "wamid.test-message", "timestamp": "1700000000", "type": "text", "text": { "body": "Hello bot!" } }]
           }
         }]
       }]
     }'
   ```

5. **Check the result.** A successful run reaches `POST /webhook/whatsapp`, transforms the payload, validates and processes the lead workflow, persists the interaction (if Supabase is configured), and attempts an outbound reply. Log output alone isn't proof of delivery — confirm against the Meta Graph API response and the recipient device.

Verify webhook reachability at any time with:

```bash
curl -X GET "http://localhost:3000/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test_123"
# should echo back: test_123
```

## Publish to GitHub

The repository includes a root `.gitignore` that excludes local `.env` files,
dependencies, build output, coverage, logs, and editor files while keeping both
`.env.example` files available as templates. Review the staged file list before
the first push:

```bash
git add .
git status --short
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Never use `git add -f` for `.env` files. If a credential was ever committed,
rotate it immediately; deleting the file in a later commit does not remove it
from Git history.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Webhook fails to verify in Meta | Verify token mismatch, or tunnel down | Confirm ngrok is running; confirm `WHATSAPP_WEBHOOK_VERIFY_TOKEN` matches the value entered in Meta |
| No request appears in backend logs | Meta is using a stale ngrok URL, or not subscribed to `messages` | Update the callback URL after every ngrok restart; confirm the `messages` field subscription |
| Request is rejected | Payload doesn't match the expected schema | Confirm the payload includes a text message under `entry[].changes[].value.messages[]`; check the transformer output in logs |
| Message processed but no reply sent | Expired access token, or wrong phone number ID | Confirm `WHATSAPP_ACCESS_TOKEN` is valid and `WHATSAPP_PHONE_NUMBER_ID` matches the sending number; check the Graph API response in logs |

## Useful commands

**Backend**

```bash
cd backend
npm run dev     # start in watch mode
npm run build    # compile TypeScript
npm start        # run the compiled build
npm test         # run tests
npm run lint      # lint
```

**Frontend**

```bash
cd clinic-dashboard
npm run dev
npm run build
npm run preview
```

## General troubleshooting

**Backend won't start**
Confirm `backend/.env` exists with valid Supabase values, that the database migration has been run, and that port 3000 is free.

**Dashboard can't load data**
Confirm the backend is running and `/health` responds. Check `clinic-dashboard/.env` for the correct `VITE_API_BASE_URL`, restart Vite after any env change, or set `VITE_USE_MOCK_DATA=true` to work without a live backend.

**Knowledge content changed**
Edit files under `backend/knowledge/`, then reload the cache:

```bash
curl -X POST http://localhost:3000/knowledge/reload
```
