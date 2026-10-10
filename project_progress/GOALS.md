# VANI Lab: overall progress (checkpoint 2026-10-10)

Detail trackers: `backend/dev_progress/`, `backend/judge_test_progress/`, `app/frontend_rework_progress/`.
Authoritative next agenda: [TASK_LIST.md](./TASK_LIST.md) → "NEXT AGENDA". PM spec: [docs/pm-guardrails-and-autoscale-spec.md](../docs/pm-guardrails-and-autoscale-spec.md).

| # | Goal | Status | Notes |
|---|------|--------|-------|
| P1 | Frontend rework (Performance, Pipeline call window, Setup, Scale-up/autoscale, Prompts editable) | ✅ Done (smoke tested) | 44 vitest pass; Chrome-checked |
| P2 | Backend API (Hono+zod, audits+SSE, perf feed, versions, experiments, autoscale mSPRT, notifications, preprod gate, sessions scaffold) | ⚠️ Done with known issues | In-memory store only; suite **99/99** (re-verified 2026-10-10); deploy auth added |
| P3 | Judge (Eve + sarvam-105b, effort low) | ⚠️ Done with known issues | callbackRequested prompt fix untested; must emit PM/IndiaMART evaluator JSON formats |
| P4 | Supabase | ⬜ Blocked | SQL never executed locally; no cloud creds attached to Render |
| P5 | Real voice live testing (Sarvam Voice Agents) | ⚠️ Coded, untested | Blocked: agents A/B/C not created; `SARVAM_APP_ID_A/B/C` unset; real audio untested |
| P6 | UI libraries (bencho.dev / rareui / beui.dev) | ⚠️ Partial | See findings |
| P7 | Deployment | ✅ Live (Vercel + Render) | Supabase + Sarvam agents still pending |
| P8 | Reserved: regression metric, DNC/auth, GChat/WhatsApp senders, digital twin | 📌 Reserved | |
| P9 | **PM spec alignment**: B-vs-A mSPRT, 9 guardrails, staged rollout 10/25/50/100, pre-prod gate, last-two-digit assignment | ⚠️ Backend done, simulated evidence only | Engine, guardrails, staged rollout, SRM/coverage gates, assignment, report, simulator exist; backend vitest 99/99, tsc clean. Frontend surfaces (A9) and pre-prod gate per spec (A10) still open |
| P10 | **Core-functionality fixes** from the 3 read-only audits | [~] In progress | B1-B6 and B10 done (backend); B7 (ingest idempotency), B8 (voice auth path), B9 (honest demo data, frontend) open; see TASK_LIST Phase B |
| P11 | Submission bundle (`skills.md`, demo video) | [~] In progress | `skills.md` and `SUBMISSION.md` written; demo video, team details, agent IDs, sample outputs open. Window 14:00–23:59 IST today |

## Update log
- 2026-10-10 (docs agent): verified backend `tsc` clean and vitest 99/99; rollout service/routes/simulator present. Updated `backend/API_CONTRACT.md`, wrote `skills.md` + `SUBMISSION.md`. Simulated results: +5 pt variant promoted ~day 3; bad variant stopped at 10% in ~1.5 days. Known limitation recorded: guardrail multiplicity.
- 2026-10-10: PM shared "Vani Lab: Guardrails and Auto-Scale Spec (MVP)"; imported to `docs/pm-guardrails-and-autoscale-spec.md` and adopted as the definition of the core features. **All task sheets enriched with the next agenda.**
- 2026-10-10: 3 read-only audits completed (backend decision engine; frontend end-to-end flow; metrics/judge/preprod/voice). Findings folded into TASK_LIST Phase B.
- 2026-10-10: Fixed the local-dev auth regression (503 on every route / `loadEnv` throw → secret required only in production) and moved the rate limiter into `buildApp` for per-instance isolation. Uncommitted; backend suite 33/35.
- 2026-10-09: checkpoint commit 63206b5 pushed to ayush-dev/development/production. Everything after it (UI polish, preprod wiring, voice scaffold, this folder) is UNCOMMITTED.
- 2026-10-09: voice call UI coded (sarvam-conv-ai-sdk 0.0.42); judge tracker statuses corrected; keys.env voice-key typo fixed.

Evidence: [docs/README.md](../docs/README.md)
