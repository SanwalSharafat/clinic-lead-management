# BrightSmile Dental — Lead Management & Automation System

## Overview

An AI-powered lead management system that receives patient inquiries via WhatsApp and web forms, extracts structured information using Gemini AI, scores leads automatically, and routes high-value leads to clinic staff for review. The system handles appointment scheduling with double-booking prevention, sends automated nurturing messages to low-scoring leads, and never provides medical advice — always deflecting clinical questions to a human dentist.

## Architecture

The system is organized into two conceptual layers:

- **Knowledge Layer** — Six markdown files in the `knowledge/` directory (`profile.md`, `services.md`, `doctors.md`, `availability.md`, `faq.md`, `policies.md`) that describe the clinic. These are loaded into memory and included in every AI prompt so the assistant has accurate, up-to-date clinic context.

- **Decision Layer** — The AI (Gemini) is asked *only* to extract structured fields and detect intent; it never makes booking decisions or give advice. All routing logic (scoring, human-review escalation, double-booking checks) runs as deterministic TypeScript code in the `services/` layer.

Code is separated into three tiers:

```
src/
├── controllers/    # HTTP request handlers, validation, response formatting
├── services/      # Business logic (scoring, workflow, calendar, messaging, AI)
├── repositories/  # Supabase data access (patients, interactions, reviews, bookings)
├── validators/    # Zod schemas for incoming request bodies
└── types.ts       # Shared TypeScript interfaces
```

## Prerequisites

- **Node.js 18+** (LTS recommended)
- A **Supabase** project (free tier is fine) — [supabase.com](https://supabase.com)
- A **Google Cloud** project with Calendar API enabled
- A **Gemini** API key from Google AI Studio
- A **Meta WhatsApp Business app** (preferred) or a legacy **WATI** account

## Setup

### 1. Clone and Install

```bash
git clone <repo-url>
cd backend
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
# Edit .env with your actual values
```

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxxx.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key (full admin access) |
| `WHATSAPP_APP_ID` | Facebook/Meta app ID for your WhatsApp Business app |
| `WHATSAPP_APP_SECRET` | Facebook/Meta app secret for the WhatsApp app |
| `WHATSAPP_ACCESS_TOKEN` | Permanent WhatsApp access token from the Meta app |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID from Meta API Setup |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Random secret string for the WhatsApp webhook verification |
| `WHATSAPP_API_BASE_URL` | Meta Graph API base URL (default: `https://graph.facebook.com/v19.0`) |
| `GEMINI_API_KEY` | Google AI Studio Gemini API key |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret |
| `GOOGLE_REFRESH_TOKEN` | Long-lived OAuth refresh token for the clinic calendar |
| `GOOGLE_CALENDAR_CALENDAR_ID` | Google Calendar ID (email address or `primary`) |
| `PORT` | Server port (default: `3000`) |

### 3. Supabase Setup

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor**, paste the full contents of `migrations/001_initial_schema.sql`.
3. Execute the SQL to create all tables, enums, and RLS policies.
4. Go to **Project Settings → API** → copy the **Project URL** and **service_role key** into your `.env`.
5. Seed the `clinic_config` table with default values:

```bash
npm run seed
```

### 4. WhatsApp Business (Direct Meta App) Setup

1. Go to the [Meta for Developers](https://developers.facebook.com) portal and create a WhatsApp Business app.
2. Copy the app ID, app secret, and access token from your app's dashboard and API setup screen.
3. In **WhatsApp > API Setup**, select your WhatsApp Business Account and copy the **Phone Number ID**.
4. Set up the webhook URL: `https://your-domain.com/webhook/whatsapp`.
5. Set the webhook verify token to match the `WHATSAPP_WEBHOOK_VERIFY_TOKEN` value in `.env`.
6. Add the values for `WHATSAPP_APP_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` to `.env`.

> **Note:** The app still starts even if WhatsApp is not configured; outbound messages will log warnings rather than sending until the direct Meta credentials are present.

### 5. Google Calendar Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com) and create a project (or select an existing one).
2. Enable the **Google Calendar API** under APIs & Services → Library.
3. Create **OAuth 2.0 credentials** (desktop app type) from APIs & Services → Credentials.
4. Run the one-time authorization flow to obtain a refresh token:

```bash
npx google-auth-library-cli --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --scope https://www.googleapis.com/auth/calendar \
  --redirect-uri http://localhost
```

   Open the printed URL in a browser, authorize, and paste the resulting code back. The CLI will output a refresh token. Copy it into `.env` as `GOOGLE_REFRESH_TOKEN`.

5. Add the client ID, client secret, and refresh token to `.env`.
6. Set `GOOGLE_CALENDAR_CALENDAR_ID` to your clinic's Google Calendar ID (the calendar's email address, or `primary` for the default calendar).

### 6. Gemini AI Setup

1. Get an API key from [Google AI Studio](https://aistudio.google.com).
2. Add it to `.env` as `GEMINI_API_KEY`.

### 7. Knowledge Files

The `knowledge/` directory contains six markdown files that the AI uses as clinic context:

| File | Contents |
|------|----------|
| `profile.md` | Clinic name, address, hours, contact info |
| `services.md` | List of treatments with descriptions and price ranges |
| `doctors.md` | Provider names, specialties, bios |
| `availability.md` | Operating hours, slot intervals, break times |
| `faq.md` | Frequently asked questions and answers |
| `policies.md` | Cancellation, no-show, payment, and insurance policies |

Edit these files to match your actual clinic. After editing, reload the in-memory cache without restarting:

```bash
curl -X POST http://localhost:3000/knowledge/reload
```

Or simply restart the server.

## Running the Server

```bash
npm run dev    # Development with auto-reload (ts-node-dev)
npm run build  # Compile TypeScript to dist/
npm start      # Production (runs compiled dist/app.js)
```

## API Endpoints

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/webhook/whatsapp` | WhatsApp webhook verification (responds with challenge token) |
| POST | `/webhook/whatsapp` | Incoming WhatsApp message — triggers extraction, scoring, routing, and continues automated replies while a human review is open |
| POST | `/webhook/form` | Web form submission — same pipeline as WhatsApp, from a web form |

### Human Reviews

| Method | Path | Description |
|--------|------|-------------|
| GET | `/human-reviews` | List reviews. Query params: `resolved`, `reason`, `limit`, `offset` |
| GET | `/human-reviews/:id` | Full review detail including patient info, score breakdown, conversation |
| POST | `/human-reviews/:id/approve` | Approve review — proceeds with the recommended next step |
| POST | `/human-reviews/:id/correct` | Correct AI-extracted fields before proceeding |
| POST | `/human-reviews/:id/escalate` | Escalate to senior staff or doctor |
| POST | `/human-reviews/:id/reject` | Reject the lead as not viable |

### Patients

| Method | Path | Description |
|--------|------|-------------|
| GET | `/patients` | List patients. Query params: `status`, `score_tier`, `limit`, `offset` |
| GET | `/patients/:id` | Patient detail with full interaction history |
| POST | `/patients/:id/won` | Mark lead as WON (converted) |
| POST | `/patients/:id/lost` | Mark lead as LOST |

### Bookings

| Method | Path | Description |
|--------|------|-------------|
| POST | `/bookings` | Create appointment with double-booking prevention |
| GET | `/bookings/availability` | Check slot availability for a given date/time range |

### System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check — returns `{ status: "ok" }` and service statuses |
| POST | `/knowledge/reload` | Reload all knowledge files from disk |

## Human Review Flow — Day-to-Day for Clinic Staff

A practical step-by-step guide for front-desk and office managers:

1. **Notification arrives.** When a HIGH or MEDIUM lead comes in, clinic staff receive a WhatsApp notification with a summary of the inquiry.

2. **Open the reviews list.** Call `GET /human-reviews?resolved=false` to see all pending reviews, sorted by score descending.

3. **Click into a review.** Call `GET /human-reviews/{id}` to see the patient's extracted information, full conversation transcript, score breakdown, and the system's recommended next step.

4. **Review the details.** Verify the AI-extracted fields (urgency, service, insurance, etc.) against the actual conversation. Check the score breakdown to understand why the lead was scored as it was.

5. **Take action:**
   - **APPROVE** (`POST /human-reviews/{id}/approve`) — The system proceeds with the recommended next step (e.g., books the appointment or sends a follow-up message to the patient).
   - **CORRECT** (`POST /human-reviews/{id}/correct`) — If any AI-extracted fields are wrong (e.g., wrong service, wrong insurance), submit corrections first, then approve.
   - **ESCALATE** (`POST /human-reviews/{id}/escalate`) — Flag for the office manager or doctor. Includes a reason and optional notes.
   - **REJECT** (`POST /human-reviews/{id}/reject`) — Close the lead as not viable (wrong clinic, spam, outside service area, etc.).

6. **Follow up.** After approval, if the lead is booked, the system creates a Google Calendar event and sends a confirmation message to the patient via WhatsApp.

## Testing

```bash
npm test
```

This runs the full Jest suite (scoring engine, extraction, deduplication, consent, safety, double-booking, human review, knowledge service, validators, idempotency, and boundary tests) with coverage output.

## Safety Features

- **No medical advice.** The AI is never asked to diagnose, treat, or advise on clinical matters. Clinical questions are detected and immediately routed to human review.
- **High/Medium leads always require human approval.** The system never auto-books or auto-commits for leads scoring ≥ 30.
- **Opt-out (STOP) immediately respected.** If a patient texts "STOP", all messaging ceases and the patient is flagged as opted out.
- **No fabricated appointment times.** The AI extracts preferred times but never invents slots. Booking goes through the Calendar service which checks real availability.
- **Ambiguous responses routed to human review.** If the AI cannot confidently extract required fields, the interaction is flagged for staff follow-up rather than guessing.
- **All AI output validated before use.** Extracted fields are validated against Zod schemas before being persisted. Invalid data is caught and sent to human review.
