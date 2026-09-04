# Clinic Lead Dashboard

The staff-facing React dashboard for reviewing AI-qualified leads, managing patients, and viewing appointments.

## Overview

The dashboard provides:

- **Overview** — Lead statistics, trend charts, and the unresolved human-review queue
- **Review details** — Conversation history, extracted fields, score breakdown, and review actions
- **Patients** — Filterable patient list with detail panels and won/lost actions
- **Appointments** — Date-grouped appointment list
- **Settings** — Dashboard preferences, including persistent dark mode

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- TanStack React Query
- Recharts
- lucide-react

## Requirements

- Node.js 18 or newer
- npm
- The backend API running locally for live data, or mock mode for frontend-only work

## Setup

From this directory:

```bash
npm install
```

Create the local environment file:

```bash
copy .env.example .env
```

Then configure:

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:3000` |
| `VITE_USE_MOCK_DATA` | Use built-in data instead of the API | `false` |

For a live local setup, use:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_USE_MOCK_DATA=false
```

Do not commit `.env` or any credentials.

## Running

### Development

```bash
npm run dev
```

Open `http://localhost:5173`.

To expose the Vite server on the local network:

```bash
npm run dev -- --host 0.0.0.0
```

### Mock mode

Mock mode lets you work on the dashboard without a running backend:

```env
VITE_USE_MOCK_DATA=true
```

Restart the development server after changing environment variables.

### Production preview

```bash
npm run build
npm run preview -- --host 0.0.0.0
```

The build command runs TypeScript type-checking before creating the Vite bundle.

## Backend integration

The dashboard expects the backend API at `VITE_API_BASE_URL`. Start the backend from the repository root:

```bash
cd backend
npm run dev
```

Then start the dashboard in a second terminal:

```bash
cd clinic-dashboard
npm run dev
```

If requests fail, confirm that `http://localhost:3000/health` returns a successful response and that the frontend environment file points to the same URL.

## Project structure

```text
src/
├── components/   # Dashboard sections and reusable UI
├── data/          # Mock data used in mock mode
├── hooks/         # React Query data hooks
├── lib/           # API client
├── types/         # Shared frontend types
├── App.tsx        # Main section layout
└── main.tsx       # Application entry point
```
