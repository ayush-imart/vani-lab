# VANI Lab Supabase schema plan

Status (2026-10-10): Initial schema, pre-prod, and staged-rollout schemas are applied to hosted Supabase. Render has `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; the backend starts with the Supabase repo and seed reads succeed through the Vercel API proxy. Dashboard-applied grants give `service_role` access to app tables while `anon` and `authenticated` remain revoked. The matching grants migration is tracked in source. Local Docker-based migration validation remains outstanding; reconcile dashboard changes with Supabase migration history before a future `supabase db push`.

## Design
- One table per API collection with `id text primary key`, `data jsonb` (the API document), `created_at timestamptz`. The API's `SupabaseCollection` (`src/repos/collection.ts`) reads and writes only `id` and `data`.
- Typed `generated always as (...) stored` columns plus CHECK constraints expose the fields we filter and constrain (scores 1-5, versions A/B/C, cohort 0-9), so the database rejects bad rows even if the API has a bug.
- Domain logic stays in the TypeScript services; repos are interfaces, so a later move to fully relational columns only touches `src/repos/*`.

## Tables
| Table | Key / typed columns | Constraints and notes |
|---|---|---|
| `versions` | id; slot, parent_id | Immutable: trigger blocks UPDATE and DELETE. prompt and changelog non-empty. Index on parent_id (history chain). |
| `experiments` | id; status, baseline_version_id, challenger_version_id, primary_metric | Exactly two version roles (baseline and challenger); FKs to versions, baseline <> challenger, status enum. |
| `rubrics` | id (`active`); primary_metric | primary metric is one of the 5 KPIs; weights sum to 1 (+-0.01). |
| `calls` | id; version, cohort, glid_last5 | cohort 0-9 (`glid % 10`), glid_last5 length <= 5, CHECK forbids a `glid` key. Indexes (version, created_at), (cohort). |
| `audits` | id; version, status, overall, guardrails_passed, model | overall and every KPI between 1 and 5; overall is computed in code. Indexes on created_at and (version, created_at). |
| `traffic_allocations` | id (`current`) | A+B+C = 100 (+-0.01), each >= 0. |
| `autoscale_settings` | id (`current`) | risk appetite enum, 0 < thresholdPct < 100. |
| `autoscale_state` | id (`current`) | mSPRT running evidence per version (below/above), pending and total batches. |
| `autoscale_decisions` | id; version, decision, p_value, log_lr, trials, successes | Append-only trigger; version in (B, C) since baseline A is never scaled; 0 <= successes <= trials; 0 <= p <= 1. |
| `notifications` | id; kind, is_read | partial index on unread. |
| `notification_preferences` | id (`default`) | inApp, gchat, whatsapp flags (external senders are stubs). |

## ER overview
```
versions 1---* versions (parent_id, history chain)
versions 1---* experiments (baseline_version_id, challenger_version_id)
rubrics (1 active) ---> weights used to compute audits.overall and calls scores.overall
calls * --- A|B|C slot --- traffic_allocations (1 row) <--- autoscale_decisions (append-only evidence log)
autoscale_settings (1) + autoscale_state (1) ---> autoscale_decisions ---> notifications (scale-down)
audits (A|B|C slot) ; notification_preferences (1)
```
Slot links (A/B/C) are logical, not FKs: a slot points at whichever prompt version currently serves it.

## Security and privacy
- RLS stance: backend-only. Migration enables RLS on every table, revokes all grants from `anon` and `authenticated`, and creates no policies. The API uses a server-side secret key; the frontend never talks to Supabase and must never receive that key.
- Current Supabase guidance: enable RLS on exposed tables, revoke leftover default grants, the `service_role`/secret key bypasses RLS so keep it server-side; table grants are checked before RLS. The API uses the current secret key. Add pgTAP tests (`supabase test db`) when auth arrives.
- Privacy: GLIDs are masked at ingest (only the last 5 digits and the cohort digit are stored; a CHECK forbids a full `glid`). Transcripts are stored in `audits.data` only for audits the operator submits; use synthetic or approved data only. No raw customer records in seeds, prompts, logs or commits.
- Retention (proposal, not enforced): audits and calls 90 days then aggregate; decisions and versions kept indefinitely (audit trail); notifications 30 days.

## Migration and rollback procedure
1. Local: `supabase init` (if no `supabase/config.toml`), `supabase start`, `supabase db reset` (applies `migrations/` then `seed.sql`). Run the API with `SUPABASE_URL` and the local secret key.
2. New change: `supabase migration new <name>`; add forward-only SQL; `supabase db reset` to test. Capture Dashboard edits with `supabase db diff --schema public` into a migration.
3. Remote: `supabase login`, `supabase link --project-ref <ref>`, `supabase db push`. If remote drifted: `supabase db pull`, then `supabase db reset` locally before pushing. Hosted schema currently includes the initial, pre-prod, and staged-rollout tables. Dashboard-applied migration history must be reconciled before a future `db push` to avoid replaying DDL.
4. Rollback: the CLI has no automatic down. Write a new forward migration that reverts the change; `rollback/*.down.sql` holds a manual teardown for the initial migration (dev only, destructive).

## Cloud project status
Project reference and secrets are kept out of tracked docs. The hosted backend uses the project URL and a secret API key configured in Render. Production startup and the versions endpoint confirm the Supabase adapter is active. Docker-based local migration validation has not yet been run.

## Created since: `preprod_evals`
Migration `20261009010000_preprod_evals.sql` (pre-prod gate runs per version; FK to versions, status enum, RLS on, grants revoked).

## Reserved tables (not created; pending items)
- `regression_metrics`: KPI deltas of a candidate vs previous version; gate for promotion.
- `call_sessions`: real voice/telephony sessions (version slot, provider call id, started/ended, recording ref); would link to `calls`.
- Auth: `profiles` / `members` and per-user RLS policies; today there is no user concept.
- Retention jobs (pg_cron) for the proposal above.

## Sources
- https://supabase.com/docs/guides/database/postgres/row-level-security (RLS on exposed tables, revoke default grants, secret key bypasses RLS, backend-only tables)
- https://supabase.com/docs/guides/local-development/overview (migration new, db reset, seed.sql, db push, db pull; the page gives no rollback command and no API key details)
