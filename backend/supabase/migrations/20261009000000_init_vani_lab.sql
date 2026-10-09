-- VANI Lab initial schema. Backend-only access via a server (secret / service_role) key.
-- Every table: id text primary key, data jsonb (the API document), created_at, plus generated
-- typed columns and CHECK constraints that enforce the invariants in the database itself.
-- Rollback: see supabase/SCHEMA_PLAN.md (down script: supabase/rollback/20261009000000_init_vani_lab.down.sql).

create table public.versions (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  slot        text generated always as (data->>'slot') stored,
  parent_id   text generated always as (data->>'parentId') stored,
  constraint versions_slot_check check (slot is null or slot in ('A','B','C')),
  constraint versions_prompt_present check (length(data->>'promptText') > 0),
  constraint versions_changelog_present check (length(data->>'changelog') > 0)
);
create index versions_parent_idx on public.versions (parent_id);

-- Prompt versions are immutable: no UPDATE, no DELETE (save-as-new only).
create function public.versions_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'prompt versions are immutable (save a new version instead)';
end $$;
create trigger versions_no_update before update or delete on public.versions
  for each row execute function public.versions_immutable();

create table public.experiments (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  status      text generated always as (data->>'status') stored,
  baseline_version_id   text generated always as (data->>'baselineVersionId') stored,
  challenger_version_id text generated always as (data->>'challengerVersionId') stored,
  primary_metric        text generated always as (data->>'primaryMetric') stored,
  constraint experiments_status_check check (status in ('draft','running','completed')),
  constraint experiments_distinct_versions check (baseline_version_id <> challenger_version_id),
  constraint experiments_baseline_fk foreign key (baseline_version_id) references public.versions (id),
  constraint experiments_challenger_fk foreign key (challenger_version_id) references public.versions (id)
);

-- Single active rubric (id = 'active'); primary metric and weights are user-editable.
create table public.rubrics (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  primary_metric text generated always as (data->>'primaryMetric') stored,
  constraint rubrics_primary_check check (primary_metric in
    ('meetingFixed','callDuration','answerRate','locationConfirmed','callbackRequested')),
  constraint rubrics_weights_sum check (abs(
    (data#>>'{weights,meetingFixed}')::numeric + (data#>>'{weights,callDuration}')::numeric +
    (data#>>'{weights,answerRate}')::numeric + (data#>>'{weights,locationConfirmed}')::numeric +
    (data#>>'{weights,callbackRequested}')::numeric - 1) <= 0.01)
);

-- Finished calls. Only the cohort digit and the last 5 GLID digits are stored (never the full GLID).
create table public.calls (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  version     text generated always as (data->>'version') stored,
  cohort      smallint generated always as ((data->>'cohort')::smallint) stored,
  glid_last5  text generated always as (data->>'glidLast5') stored,
  constraint calls_version_check check (version in ('A','B','C')),
  constraint calls_cohort_check check (cohort between 0 and 9),
  constraint calls_glid_masked check (length(glid_last5) <= 5),
  constraint calls_no_full_glid check (not (data ? 'glid'))
);
create index calls_version_idx on public.calls (version, created_at desc);
create index calls_cohort_idx on public.calls (cohort);

create table public.audits (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  version     text generated always as (data->>'version') stored,
  status      text generated always as (data->>'status') stored,
  overall     numeric generated always as ((data->>'overall')::numeric) stored,
  guardrails_passed boolean generated always as ((data->>'guardrailsPassed')::boolean) stored,
  model       text generated always as (data->>'model') stored,
  constraint audits_version_check check (version in ('A','B','C')),
  constraint audits_status_check check (status in ('running','done','error','cancelled')),
  constraint audits_overall_range check (overall is null or overall between 1 and 5),
  constraint audits_kpi_range check (
    data->'kpis' is null or (
      (data#>>'{kpis,meetingFixed}')::numeric between 1 and 5 and
      (data#>>'{kpis,callDuration}')::numeric between 1 and 5 and
      (data#>>'{kpis,answerRate}')::numeric between 1 and 5 and
      (data#>>'{kpis,locationConfirmed}')::numeric between 1 and 5 and
      (data#>>'{kpis,callbackRequested}')::numeric between 1 and 5))
);
create index audits_created_idx on public.audits (created_at desc);
create index audits_version_idx on public.audits (version, created_at desc);

create table public.traffic_allocations (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  constraint traffic_sum check (abs(
    (data->>'A')::numeric + (data->>'B')::numeric + (data->>'C')::numeric - 100) <= 0.01),
  constraint traffic_nonneg check ((data->>'A')::numeric >= 0 and (data->>'B')::numeric >= 0 and (data->>'C')::numeric >= 0)
);

create table public.autoscale_settings (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  constraint autoscale_risk_check check (data->>'riskAppetite' in ('conservative','moderate','fast')),
  constraint autoscale_threshold_check check ((data->>'thresholdPct')::numeric > 0 and (data->>'thresholdPct')::numeric < 100)
);

-- Running mSPRT evidence per version (below/above tests), pending and total batches.
create table public.autoscale_state (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

-- Auditable decision log: append-only (mSPRT evidence: pValue, logLR, trials, successes).
create table public.autoscale_decisions (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  version     text generated always as (data->>'version') stored,
  decision    text generated always as (data->>'decision') stored,
  p_value     double precision generated always as ((data->>'pValue')::double precision) stored,
  log_lr      double precision generated always as ((data->>'logLR')::double precision) stored,
  trials      integer generated always as ((data->>'trials')::integer) stored,
  successes   integer generated always as ((data->>'successes')::integer) stored,
  constraint decisions_version_check check (version in ('B','C')), -- baseline A is never scaled
  constraint decisions_decision_check check (decision in ('scale-up','scale-down')),
  constraint decisions_counts_check check (successes between 0 and trials),
  constraint decisions_p_range check (p_value between 0 and 1)
);
create index decisions_created_idx on public.autoscale_decisions (created_at desc);
create function public.decisions_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'autoscale decisions are append-only';
end $$;
create trigger decisions_no_update before update or delete on public.autoscale_decisions
  for each row execute function public.decisions_append_only();

create table public.notifications (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  kind        text generated always as (data->>'kind') stored,
  is_read     boolean generated always as ((data->>'read')::boolean) stored,
  constraint notifications_kind_check check (kind in ('scale-down','scale-up','info'))
);
create index notifications_unread_idx on public.notifications (created_at desc) where not is_read;

create table public.notification_preferences (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

-- RLS: backend-only. RLS on, all grants revoked from anon/authenticated, no policies.
-- The API connects with a server-side secret key (bypasses RLS); the browser never talks to Supabase.
do $$
declare t text;
begin
  foreach t in array array['versions','experiments','rubrics','calls','audits','traffic_allocations',
    'autoscale_settings','autoscale_state','autoscale_decisions','notifications','notification_preferences']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
