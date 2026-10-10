-- Staged rollout engine (PM spec): rollout runs and an auditable decision log, plus the wider
-- experiment status set (scheduled, paused, rolled_back, ended). Written but NOT yet applied to the
-- hosted project (no Supabase access in the dev loop); apply with `supabase db push`.
alter table public.experiments drop constraint experiments_status_check;
alter table public.experiments add constraint experiments_status_check
  check (status in ('draft','scheduled','running','paused','completed','rolled_back','ended'));

create table public.rollout_runs (
  id            text primary key, -- = experiment id
  data          jsonb not null,
  created_at    timestamptz not null default now(),
  status        text generated always as (data->>'status') stored,
  experiment_id text generated always as (data->>'experimentId') stored,
  constraint rollout_status_check check (status in ('scheduled','running','paused','completed','rolled_back','ended')),
  constraint rollout_experiment_fk foreign key (experiment_id) references public.experiments (id)
);

create table public.rollout_decisions (
  id            text primary key,
  data          jsonb not null,
  created_at    timestamptz not null default now(),
  experiment_id text generated always as (data->>'experimentId') stored,
  action        text generated always as (data->>'action') stored,
  constraint rollout_decision_experiment_fk foreign key (experiment_id) references public.experiments (id)
);
create index rollout_decisions_exp_idx on public.rollout_decisions (experiment_id, created_at);

alter table public.rollout_runs enable row level security;
alter table public.rollout_decisions enable row level security;
revoke all on public.rollout_runs, public.rollout_decisions from anon, authenticated;
