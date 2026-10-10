-- Manual rollback for 20261010000000_rollout_engine.sql (dev only, destructive).
drop table if exists public.rollout_decisions, public.rollout_runs cascade;
alter table public.experiments drop constraint if exists experiments_status_check;
alter table public.experiments add constraint experiments_status_check check (status in ('draft','running','completed'));
