# Cross-cutting task list

## Deployment status (2026-10-09)
- [x] Choose free-tier hosting: Vercel Hobby frontend, Render Free API + Eve, Supabase Free database.
- [x] Publish application source to the public GitHub `production` branch; captured participant/source files, local Vercel state, and credentials are excluded.
- [x] Deploy Vercel production frontend: https://vani-lab.vercel.app
- [x] Deploy Render Free API: https://vani-lab-api.onrender.com; `/health` returns 200.
- [x] Configure Vercel server-side backend URL/token; public Vercel API proxy returns authenticated versions.
- [x] Create Supabase project and apply/verify both SQL migrations.
- [ ] Attach Supabase URL and server secret to Render; until then the backend uses in-memory storage and data is not durable. Current task blocker: the Supabase server secret is not available in the deployment environment; retrieve it from the signed-in Supabase project settings (or authenticated CLI) and set it as a Render secret. Do not paste it into chat or commit it.
- [ ] Create/publish Sarvam Voice Agents A/B/C, rotate the previously exposed voice key, and configure app IDs before real calls can work.

## Known limitations
- Render Free can sleep and restart; in-memory state is ephemeral. Supabase persistence is not active until its server key is configured in Render.
- Real voice calls require three published Sarvam app IDs and a current voice API key.
- Use synthetic records in public demos; customer records and call recordings stay in the approved environment.

## Verified deployment
- `production` points to `0c1bba6c1bc308735aa207fe8d1c4eb93ac0d5bf`, matching the current live Render deploy.
- Vercel frontend and `/api/vani/health`, `/api/vani/versions`, plus Render `/health` returned successful responses on 2026-10-09.
