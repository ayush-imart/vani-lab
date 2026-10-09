# Deployment runbook

## Target layout

- **Frontend:** Vercel Hobby project `vani-lab`, built from the `app/` directory using the Vercel CLI.
- **API and judge:** one Render Free web service, built from `backend/Dockerfile`. `server.ts` starts Eve on loopback port 2000 and serves the Hono API on Render's `PORT`.
- **API access:** browser requests go to a Vercel serverless proxy at `/api/vani`. The proxy holds the backend token; Render requires the matching bearer token for protected routes.
- **Database:** Supabase Free. Only the backend receives its server-side secret key.

This is a hackathon demo deployment. Render Free sleeps after 15 minutes without traffic and loses local files on sleep, restart, or deploy. Eve workflow run state is therefore not durable. Supabase is the durable store for app data. [Render Free limitations](https://render.com/docs/free)

Vercel Hobby is limited to personal, non-commercial use. Review the [Vercel Hobby fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines).

## Required environment

### Render

- `API_SHARED_SECRET`: random 32+ character bearer secret, also configured as Vercel `VANI_BACKEND_TOKEN`.
- `CORS_ORIGINS`: exact Vercel production origin.
- `PUBLIC_API_URL`: Vercel production origin plus `/api/vani`.
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY`: server-side project URL and secret key.
- `SARVAM_API_KEY`: server-side Eve judge key.
- `SARVAM_VOICE_API_KEY`, `SARVAM_ORG_ID`, `SARVAM_WORKSPACE_ID`, `SARVAM_APP_ID_A`, `SARVAM_APP_ID_B`, `SARVAM_APP_ID_C`: required for real voice sessions; configure only after rotating any previously exposed key and publishing the three agents.
- Keep `AUDITOR=eve` and `AUTOSCALE_TICK_MS=0` for the sleeping Free service.

### Vercel

Set server-only `VANI_BACKEND_URL` to the Render service URL and `VANI_BACKEND_TOKEN` to the same value as Render's `API_SHARED_SECRET`. The browser uses same-origin `/api/vani`; backend secrets must not be exposed through `VITE_*` variables.

## Supabase

The two migrations in `backend/supabase/migrations/` are applied in the demo project. Do not apply `seed.sql` to production. Never place a Supabase secret in the frontend, repository, image, or chat.

## Release order

1. Push reviewed application code and docs to GitHub `production` (source-data and local secrets excluded).
2. Create the Render Free Docker service from GitHub `production`, root `backend`, file `backend/Dockerfile`; set backend secrets.
3. Set Vercel server-only backend URL/token, deploy `app/` from `production`.
4. Verify Render `/health`, Vercel-to-Render authenticated API access, Supabase-backed persistence, and voice session setup with synthetic data.

## Limitations

- Render Free may sleep and restart; in-memory Eve workflow state is ephemeral.
- Real voice calls require three published Sarvam apps and current voice credentials.
- Use synthetic records in demos. Never upload customer/call data to hosting providers.
