# VANI Lab: overall progress (checkpoint 2026-10-09)

Detail trackers: `backend/dev_progress/`, `backend/judge_test_progress/`, `app/frontend_rework_progress/`.

| # | Goal | Status | Notes |
|---|------|--------|-------|
| P1 | Frontend rework (Performance, Pipeline call window, Setup, Scale-up/autoscale, Prompts editable) | ✅ Done (smoke tested) | 37 vitest pass; Chrome-checked |
| P2 | Backend API (Hono+zod, audits+SSE, perf feed, versions, experiments, autoscale mSPRT, notifications, preprod gate, sessions scaffold) | ⚠️ Done with known issues | In-memory store only; 35 tests pass |
| P3 | Judge (Eve + sarvam-105b, effort low) | ⚠️ Done with known issues | 1 of 5 LLM budget used by backend + earlier ~16 judge calls before cap; callbackRequested prompt fix untested |
| P4 | Supabase | ⬜ Blocked | SQL never executed; Docker Desktop not running; no cloud creds |
| P5 | Real voice live testing (Sarvam Voice Agents) | ⚠️ Coded, untested | call-session + backend /sessions proxy done (FE 44 tests, BE 35); textbox removed. Blocked: agents A/B/C not created (MCP OAuth), SARVAM_APP_ID_A/B/C unset, real audio untested |
| P6 | UI libraries (bencho.dev / rareui / beui.dev) | ⚠️ Partial | See findings |
| P7 | Deployment | ⬜ Not started | Recommendation only |
| P8 | Reserved: regression metric, DNC/auth, GChat/WhatsApp senders, digital twin | 📌 Reserved | |

## Update log
- 2026-10-09: checkpoint commit 63206b5 pushed to ayush-dev/development/production. Everything after it (UI polish, preprod wiring, voice scaffold, this folder) is UNCOMMITTED.
- 2026-10-09: voice call UI coded (sarvam-conv-ai-sdk 0.0.42); judge tracker statuses corrected; keys.env voice-key typo fixed.

Evidence: [docs/README.md](../docs/README.md)
