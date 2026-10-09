# VANI Lab

**Agent A/B Testing & Auto-Rollout for voice AI.** Compare prompt versions on controlled traffic, review outcome metrics, run pre-production evaluations, and record rollout decisions.

**Live demo:** [vani-lab.vercel.app](https://vani-lab.vercel.app)

## Architecture

- `app/`: TanStack Start frontend for experiment setup, call sessions, evaluation, and rollout review.
- `backend/`: TypeScript API, Eve audit service, Sarvam voice-session proxy, and Supabase persistence adapter.
- `backend/supabase/migrations/`: database schema migrations. Do not apply the local synthetic seed to production.

## Run locally

Requirements: Node.js 24+, Docker (for Eve), and environment values in the ignored root `keys.env`.

```powershell
cd backend
npm ci
npm run typecheck
npm run eve:build
npm run start:render
```

In another terminal:

```powershell
cd app
npm ci
npm run dev
```

Use `keys.env.example` as a names-only template and fill credentials locally. Never commit keys or customer/call data.

## Deployment

The hackathon deployment uses Vercel Hobby for the frontend, Render Free for the API + Eve service, and Supabase Free for the database. See [deployment runbook](docs/deployment-runbook.md). Deployment branch: `production`.

## Data handling

Do not upload customer records, call recordings, or credentials. Use synthetic examples for demos. The public deployment repository contains application code and operational documentation only.
