# Cross-cutting task list

> **⚠️ READ FIRST — PM spec (2026-10-09):** [docs/pm-guardrails-and-autoscale-spec.md](../docs/pm-guardrails-and-autoscale-spec.md) — "Vani Lab: Guardrails and Auto-Scale Spec (MVP)". Imported from the PM-shared file `C:\Users\Imart\Downloads\Untitled document (3).md`. This spec **supersedes** the current absolute-threshold autoscale: it requires B-vs-A mSPRT, guardrails, staged rollout, a pre-prod gate, and last-two-digit GLID assignment. Incorporate every value it provides.

**Status legend:** `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked on an external credential/decision.

## NEXT AGENDA — 2026-10-10 (ordered)

### Phase A — PM spec alignment (primary; make every spec value real)
- [x] **A1. Spec-constants module (single source of truth).** Backend `backend/src/spec.ts` + frontend mirror `app/src/components/vani/spec.ts`. Encode every spec number: 4 primary metrics + baselines (10.2% / ~18% / 31.0% / ~6.2%); per-primary secondary metrics; 9 guardrails (baseline, pre-prod tolerance, live rule); pre-prod design; statistics; rollout; validity; assignment. *(code + tests exist; backend vitest 99/99)*
- [x] **A2. B-vs-A mSPRT (two-sample).** Replace the one-sample absolute-threshold test for *winner* decisions with a mixture test over the lift δ, τ = "smallest win worth shipping" (default +3 pts), α = 0.05; stage-stratified lift; only fully judged calls count. Record the method + evidence (repo guide). *(code + tests exist; backend vitest 99/99)*
- [x] **A3. Guardrails engine.** New `backend/src/services/guardrails.ts`: 9 guardrails compared **B vs A in the same run**; block / roll back per live rule (fake meetings B > 1.5×A proven; early drop, do-not-call, bot looping, seller repeat, unanswered questions, system-dropped proven worse; slow replies P95 +0.5 s; talk-over proven worse). *(code + tests exist; backend vitest 99/99)*
- [x] **A4. Staged rollout policy.** Replace `RISK_STEPS` + `thresholdPct` with stages **10 → 25 → 50 → 100** and gates (10→25 lift ≥ −1 pt; 25→50 lift ≥ +1 pt & Λ ≥ 5; 50→100 lift ≥ smallest win & Λ ≥ 20 & PM approval); 24 h cooldown; 5% holdback for 7 days; automatic scale-down triggers. *(code + tests exist; backend vitest 99/99)*
- [x] **A5. Assignment by the last TWO GLID digits (00–99).** 100 buckets; 10% = 00–09, 25% = 00–24; balance check at launch. *(code + tests exist; backend vitest 99/99)*
- [x] **A6. Validity gates before any decision.** SRM χ² p < 0.001 → pause + freeze + alert PM; outcome-coverage floor (proposal 80%) → hold decisions. *(code + tests exist; backend vitest 99/99)*
- [x] **A7. Primary + secondary metrics.** Primary selectable (Meeting Fixed default; Positive outcome; Conversation reach; Callback fixed) with its per-primary extra guardrail; secondary metrics reported with significance, never promote/block. *(code + tests exist; backend vitest 99/99)*
- [x] **A8. Contract + endpoints.** Experiment window (start/end) and start/stop/complete; stage + Λ + guardrail status on decisions; run report; promote; rollback. *(code + tests exist; backend vitest 99/99)*
- [ ] **A9. Frontend surfaces.** Primary selector, guardrail panel, staged-rollout display, run report / audit trail, real promotion/rollback (`PUT /traffic`), one-click early-stop demo, honest "simulated" labels.
- [ ] **A10. Pre-prod gate per spec.** Validity bands, −2 pt primary tolerance, 8-scenario regression suite (zero failures), overfit checks (hidden set, ≤ 3 runs).

### Phase B — Core functionality (from 3 read-only audits)
- [x] **B1. Local-dev auth regression (fixed, uncommitted — verify).** `buildApp()` returned `503` on every route without `API_SHARED_SECRET`, and `loadEnv()` threw without it, so the local API was **down** and the browser (no proxy token) could never authenticate. Now the secret is required only when `NODE_ENV=production`. Restored 8 backend tests.
- [x] **B2. Rate-limiter test isolation (fixed, uncommitted — verify).** Limiter state was module-global (shared across app instances); moved into `buildApp`. Restored 6 tests.
- [x] **B3. Pre-prod gate ignores non-real runs.** `gate()` filters `&& r.real`, contradicting the contract ("latest result per scenario across finished runs") and the test; the UI "Run smoke tests" leaves the gate **pending forever**. 2 backend tests still fail. Drop the `r.real` filter (or make the UI send `real:true`). *(gate counts fake-judge runs; the 2 failing tests now pass, suite 99/99)*
- [x] **B4. Judge → rollout mapping (decision needed).** Audits store score-only calls and never feed autoscale. Decide + document one auditable mapping, or keep the split and surface judge-derived evidence as a separate labelled signal. *(decision: kept the split; judge scores surface as a separate labelled signal `judgeEvidence`, `usedForDecision:false`)*
- [x] **B5. Metric-unit honesty.** `/metrics/versions` boolean rate and `/leaderboard` mean 1–5 are both "meetingFixed"; verdict deltas mix units. Qualify/rename and state units. *(`units` on `/metrics/versions`; leaderboard documented as mean 1-5 judge score)*
- [x] **B6. "No data" vs 0%.** A version with only audit calls reports 0% meeting-fixed instead of "no data". *(rates are `null` = no data; `outcomeCalls` is the denominator)*
- [ ] **B7. Ingest idempotency.** No dedup on `(glid, version, at)`; `/calls` + `/audits` can double count.
- [ ] **B8. Auth vs browser SDK.** Voice `/sarvam/.../url` needs the proxy bearer; `PUBLIC_API_URL` must point at the Vercel proxy or voice breaks.
- [ ] **B9. Honest demo data.** Screens read "Live backend" while posting client-synthetic calls/outcomes. Label simulated modes and stop default synthetic posting.
- [x] **B10. Update `backend/API_CONTRACT.md`** — it still says "No auth yet". *(done 2026-10-10: auth, new endpoints, nullable metrics, units)*

### Phase E - Multi-experiment flow (user request 2026-10-10; NOTED ONLY, NOT IMPLEMENTED)
Versions are a shared library (create / delete / update); experiments are separate runs that pick versions from it.
- [ ] **E1. Top-bar experiment picker (restores the removed one).** Small picker in the top bar, Google Cloud console style; the dropdown lists all experiments.
- [ ] **E2. Opening screen = experiments list.** Replaces Performance as the landing page (`/`); the user chooses an experiment first, then enters the app scoped to it.
- [ ] **E3. Experiment is the global scope.** Selecting an experiment from the picker filters every screen (Performance, Pipeline, Setup, Autoscale, Prompts as relevant, notifications, pre-prod) to that experiment's versions and data only. Backend: experiment id on versions-in-experiment, calls, audits, metrics, decisions, traffic, notifications.
- [ ] **E4. Create-experiment flow.** Create a new experiment, pick versions from the shared library, run it. Existing setup screen is reused.
- [ ] **E5. Replace the outdated "live test" tab in the creator with the risk-appetite scaling version.** The user only chooses the starting GLIDs and the split among them; scale-up and auto-rejection are handled by the app as they are now.
- [ ] **E6. Risk appetite is configured at experiment creation and stored per experiment** (not a global setting).
- [ ] **E7. Check against the PM spec:** the spec lets the PM choose start size, primary metric, smallest win, max length; reconcile these with E5/E6 (conservative / moderate / fast presets are marked roadmap in the spec).

### Phase C — Submission (window 14:00–23:59 IST today)
- [x] **C1. Write `skills.md`** (required submission artifact; currently missing). *(`skills.md` written at repo root)*
- [ ] **C2. Record a demo video** of the end-to-end flow on synthetic data. Scripted shot list is in `SUBMISSION.md`; not recorded yet.
- [~] **C3. Assemble the submission bundle** per `hackathon-submission-guidelines/`. `SUBMISSION.md` maps each artifact to its file; open: team details, agent IDs, `sample-outputs/`, video.

### Phase D — Deployment (blocked on external credentials)
- [!] **D1. Attach Supabase URL + server secret to Render** (in-memory storage until then).
- [~] **D2. Sarvam Voice Agents A/B/C created + committed via MCP (2026-10-10)**: app ids in local keys.env (SARVAM_APP_ID_A/B/C); runtime `/url` returned a signed session URL for A (HTTP 200). Prompt is a condensed buyer-side VANI (full 159k prompt has undefined template vars); B/C differ only in opening line. Still open: real-microphone test by the user, set the same ids on Render, rotate the exposed voice key.

## Evidence-based workstream status (2026-10-10)
- Backend suite: **99 / 99 pass** (10 test files), `tsc --noEmit` clean (re-run 2026-10-10). Rollout service, routes and the A/B simulator exist.
- Simulator (synthetic data): a true +5 pt variant is promoted at about day 3; a bad variant (3.3% vs 18.3%) is stopped at 10% traffic after about 1.5 days.
- Frontend suite: last reported 44 / 44, `tsc` clean (not re-run by the docs agent; the frontend agent is changing `app/` now).
- Local backend on `:8787` was **down** (env threw) before B1/B2; fixed path server now starts without the secret.
- Live deploy: Render `/health` → 200; Vercel `/api/vani/health` → 200.
- B1/B2 changes are **uncommitted** in the main working repo (`ayush-dev`).

## Deployment
- [x] Choose free-tier hosting: Vercel Hobby frontend, Render Free API + Eve, Supabase Free database.
- [x] Create Supabase project and apply/verify both SQL migrations; server credentials still need to be attached to Render.
- [x] Create public GitHub deployment repository `ayush-imart/vani-lab`; source-material snapshots with participant/account data are excluded from the deployment mirror.
- [x] Publish current reviewed app/backend source to GitHub `production`.
- [x] Create Render Free Docker service from GitHub `production` and configure secrets.
- [x] Configure Vercel server-side Render URL/token and deploy the frontend from `production`.
- [x] Verify hosted API access (Vercel proxy) and Render `/health`.
- [ ] Verify Supabase-backed persistence end to end.
- [ ] Create/publish Sarvam Voice Agents A/B/C, rotate the previously exposed voice key, and configure app IDs before enabling real calls.
- [ ] Re-deploy and re-verify after PM spec alignment (Phase A) changes the engine + contract.

## Known limitations
- Render Free may sleep and restarts can discard local state. The API health route remains public; protected application routes require the Vercel proxy token.
- Real voice calls are not ready until three Sarvam app IDs and a current key are configured.
- The rollout engine is B-vs-A mSPRT, but all rollout evidence so far is **simulated**; no real prompt has been A/B tested on real traffic. The legacy `/autoscale` endpoints still use the older one-sample absolute-threshold test.
- Guardrail multiplicity: 9 simultaneous always-valid tests (each alpha 0.05) inflate the familywise false-rollback risk; seen in a simulated +5 pt run where do-not-call was falsely "proven worse" during holdback. Spec-design question for the PM; not changed.
- Use synthetic data in public demos; customer records and call recordings stay in the approved environment.
