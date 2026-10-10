# Backend smoke tests

Template: What was tested / How / Result / Follow-up needed. Only real results below.

## Current status (2026-10-10)
- `npx tsc --noEmit` clean.
- `npx vitest run` → **99/99 pass** across 10 files (re-run 2026-10-10). The earlier 2 pre-prod gate failures no longer occur.
- Auth fix (uncommitted): `buildApp()` now enforces the bearer only when `API_SHARED_SECRET` is set; `loadEnv()` requires it only in production. Before: every route 503'd and `loadEnv()` threw, so the local server was down.
- Rate-limiter fix (uncommitted): the rate-window map now lives inside `buildApp`, so separate app instances in tests no longer share state.

## Planned tests (next agenda)
> 2026-10-10: suites for spec, two-sample mSPRT, guardrails, rollout policy and the rollout simulator exist and pass. Gaps: repeated-run false-positive measurement; guardrail-multiplicity test; ingest idempotency.

- **Spec constants:** assert every baseline/tolerance/stage/α/τ/Λ matches the PM doc.
- **Two-sample mSPRT (B vs A):** peeking false-positive bound ≤ α; detects +3 pt; stage-stratified combine.
- **Guardrails:** each of the 9 blocks/rolls back when B is proven worse beyond its live rule.
- **Staged rollout:** 10→25→50→100 gates, 24 h cooldown, holdback, automatic scale-down.
- **Assignment/validity:** last-two-digit buckets 00–99, 10% = 00–09; SRM χ² catches imbalance (p < 0.001); coverage floor holds decisions.
- **Preprod:** fake runs count toward the gate; −2 pt primary tolerance; regression suite zero-failures; overfit flag.

## Log

### 2026-10-10, verification by docs agent
- What: type check and full backend suite.
- How: `npx tsc --noEmit`; `npx vitest run`.
- Result: tsc clean; 10 files, 99/99 tests pass.
- Simulator (synthetic data): +5 pt variant promoted ~day 3; bad variant stopped at 10% ~1.5 days; in a simulated +5 pt run do-not-call was falsely flagged "proven worse" during holdback (guardrail multiplicity, PM spec question).
- Follow-up: Supabase SQL still never run against a Postgres; real-traffic validation not done.

### 2026-10-10, core fixes
- What: local-dev auth regression + rate-limiter isolation.
- How: `npx tsc --noEmit`; `npx vitest run`.
- Result: typecheck clean; suite went 20/35 → **33/35** after the fixes (8 tests restored by auth, 6 by limiter isolation; overlap means the net is +13).
- Follow-up: fix `gate()` (B-B3) to reach 35/35; verify a real local server start without `API_SHARED_SECRET`.

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

### 2026-10-10 rollout review fixes
- What: pre-prod gate at start, ingest idempotency/404/stage stamping, resume, final-stage approve, step-down approval reset, quiet ticks, experiment-scoped performance reads.
- How: new `src/rollout-fixes.http.test.ts`; existing `src/rollouts.http.test.ts` starts now send `allowSimulatedGate: true` (start without a passed gate is now 409 by spec). `npx vitest run` 13 files, 139 tests pass; `npx tsc --noEmit` clean for these files.
- Result: pass.
