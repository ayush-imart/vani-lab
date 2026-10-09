# Backend task list

## G0 — Contract
- [x] `src/contract/index.ts` zod schemas
- [x] `API_CONTRACT.md`
- [x] Message frontend agent
- [x] Contract typechecks (`tsc`)

## G1 — Skeleton
- [x] env (relax SARVAM_API_KEY), errors, logger, validation helpers (`src/lib/`)
- [x] Collection abstraction + memory + Supabase (`src/repos/collection.ts`)
- [x] Domain repos `src/repos/<domain>.ts` + `index.ts`
- [x] `src/app.ts`, `src/registry.ts`, `src/server.ts`
- [x] SQL migrations, seed.sql, `supabase/SCHEMA_PLAN.md`
- [x] package.json scripts (dev, eve:dev)

## G2 — Auditor
- [x] AuditorPort + Eve impl + fake impl (`src/services/auditor.ts`)
- [x] audits service (events hub, retry, cancel), routes, tests

## G3 — Rubric
- [x] rubric service/routes/tests

## G4 — Performance
- [x] ingest, metrics, cohorts, verdict, leaderboard + tests

## G5 — Versions/experiments
- [x] CRUD, history, diff, experiments + tests

## G6 — Autoscale
- [x] port sequential-test.ts + tests, scale-policy pure logic + tests
- [x] service, routes, scheduler, decisions, scale-down notification

## G7 — Notifications
- [x] service, routes, sender interface (log-only)

## G8 — Gates
- [x] tsc, vitest, eve build, curl each endpoint

## Notes / blockers
- 2026-10-09: keys.env has only SARVAM_API_KEY and SARVAM_LLM_API_KEY; no Supabase credentials -> memory repo.
