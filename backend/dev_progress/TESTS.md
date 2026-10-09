# Backend smoke tests

Template: What was tested / How / Result / Follow-up needed. Only real results below.

## Log

### 2026-10-09, all goals
- What: type check, unit and route tests, Eve build, live API.
- How: `npx tsc --noEmit` clean; `npx vitest run` 4 files, 29 tests pass (ported mSPRT and scale policy, API routes on the in-memory repo with a fake auditor, SSE stage order, retry on invalid output, cancel, rubric weights, GLID masking and cohorts, version diff/history, experiments, autoscale scale-down plus notification, CORS); `npx eve build` OK; API on 8787 with AUDITOR=fake, every endpoint curled once; then API with AUDITOR=eve: POST /audits with a synthetic transcript went through the Eve dev server (sarvam-105b) and returned all stages plus a result (overall 4.1). 1 of 5 LLM calls used.
- Result: pass.
- Follow-up needed: the SQL in `supabase/migrations` and the Supabase adapter were never run against a Postgres (no DB, no credentials); verify with `supabase db reset`.

### 2026-10-09 catch-up sprint (G11-G14)
- What: pre-prod gate, audits -> calls, voice session scaffold and proxy.
- How: `npx tsc --noEmit` clean; `npx vitest run` 5 files, 35 tests pass (new `src/sprint2.test.ts`: gate pending -> pass with fake judge, fail with scripted judge reasons, real-run guards, audit creates masked score-only call and no raw GLID on the audit, session config has no secret, proxy adds X-API-Key and filters query/ids). Live curl on a temp server (port 8789, fake auditor): scenarios, run, gate, sessions (200 and 503), proxy 503 without key, audit -> call.
- Result: pass.
- Follow-up: G10 blocked (Docker daemon down). Sarvam proxy path/headers come from reading sarvam-conv-ai-sdk 0.0.42 source, never exercised against Sarvam. Real Eve pre-prod run not executed (budget kept: 1 of 5 LLM calls used).
