# Cross-cutting task list

## Deployment status (2026-10-09)
- [x] Choose free-tier hosting: Vercel Hobby frontend, Render Free API + Eve, Supabase Free database.
- [x] Publish application source to the public GitHub `production` branch; captured participant/source files, local Vercel state, and credentials are excluded.
- [x] Deploy Vercel production frontend: https://vani-lab.vercel.app
- [x] Deploy Render Free API: https://vani-lab-api.onrender.com; `/health` returns 200.
- [x] Configure Vercel server-side backend URL/token; public Vercel API proxy returns authenticated versions.
- [x] Create Supabase project and apply/verify both SQL migrations.
- [ ] Attach Supabase URL and server secret to Render; until then the backend uses in-memory storage and data is not durable.
- [ ] Create/publish Sarvam Voice Agents A/B/C, rotate the previously exposed voice key, and configure app IDs before real calls can work.

## Known limitations
- Render Free can sleep and restart; in-memory state is ephemeral. Supabase persistence is not active until its server key is configured in Render.
- Real voice calls require three published Sarvam app IDs and a current voice API key.
- Use synthetic records in public demos; customer records and call recordings stay in the approved environment.
