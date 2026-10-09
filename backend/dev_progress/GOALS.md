# Backend development: goals

Source: coordinator brief + `C:\Users\Imart\.claude\plans\stateful-crafting-lark.md` + `app/frontend_rework_progress/BACKEND_NEEDS.md`.

| # | Goal | Status | Covers |
|---|------|--------|--------|
| G0 | HTTP contract published (API_CONTRACT.md + zod) | ✅ Done (smoke tested) | Brief: contract first |
| G1 | Skeleton: Hono app, layers, errors, CORS, env, repos (memory + Supabase), migrations + SCHEMA_PLAN | ⚠️ Done with known issues (SQL and Supabase adapter never run against a Postgres) | Brief 1 |
| G2 | Auditor: /audits, SSE, Eve port, retry, rubric-weighted overall | ✅ Done (smoke tested incl. 1 real Sarvam call) | Brief 2 |
| G3 | Rubric/metrics config endpoints | ✅ Done (smoke tested) | Brief 3 |
| G4 | Performance feed, cohorts, leaderboard, call ingest | ✅ Done (smoke tested) | Brief 4 |
| G5 | Prompt versions + experiments | ✅ Done (smoke tested) | Brief 5 |
| G6 | Autoscale engine (mSPRT), traffic, decisions, scheduler | ✅ Done (smoke tested) | Brief 6 |
| G7 | Notifications + sender interface | ✅ Done (smoke tested) | Brief 7 |
| G8 | Quality gates: tsc, vitest, eve build, curl every endpoint | ✅ Done | Brief gates |
| G9 | Reserved for later (pending items) | 📌 Documented, not built | Brief |

## Catch-up sprint
| # | Goal | Status | Covers |
|---|------|--------|--------|
| G10 | Local Supabase (CLI + Docker), apply migrations/seed, run adapter, curl in Supabase mode | ⛔ Blocked: Docker daemon not running (`docker info` cannot reach the engine); nothing attempted beyond the check | Sprint 1 |
| G11 | Pre-prod gate: scenarios, /preprod/runs, /preprod/gate, repo, migration | ✅ Done (smoke tested with fake judge; real Eve run not executed) | Sprint 2 |
| G12 | Audits -> calls (score-only, masked GLID, optional glid) | ⚠️ Done with known issue: no autoscale evidence from audits (heuristic, needs user decision) | Sprint 3 |
| G13 | Voice session scaffold + Sarvam signed-URL proxy | ✅ Done (tests with fake fetch; no Sarvam call made) | Sprint 4 |
| G14 | Docs: API_CONTRACT, SCHEMA_PLAN, BACKEND_NEEDS, frontend notified | ✅ Done | Sprint 5 |

## Reserved for later (pending items)
- Pre-prod evals (offline eval runs of a candidate prompt before live traffic); reserved table `preprod_evals`
- Regression metric (guard against a KPI drop vs. previous version); reserved table `regression_metrics`
- Real voice/telephony bot sessions (`/calls/{version}` WebSocket); reserved table `call_sessions`
- Auth (API has none; frontend never talks to Supabase), per-user RLS policies
- Vercel deployment (the Hono app is portable; Eve judge host and scheduler need a plan)
- External notification senders (GChat, WhatsApp): interface exists, log-only
- Supabase: no credentials found, memory repo used; SQL unexecuted
- Audits are not yet turned into `calls` rows (leaderboard/cohorts come from POST /calls)

## Update log
- 2026-10-09: folder created; contract published.
- 2026-10-09: G0-G8 done. SQL migration/seed/SCHEMA_PLAN written but not executed on any Postgres. 1 of 5 LLM smoke calls used.

Evidence: [Sarvam voice agents](../../docs/sarvam-voice-agents.md) (sessions proxy, keys), [deployment](../../docs/deployment-options.md), [judge model](../../docs/judge-model-findings.md)
