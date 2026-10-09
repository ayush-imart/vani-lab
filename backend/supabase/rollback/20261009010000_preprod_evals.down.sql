-- Manual rollback for 20261009010000_preprod_evals.sql (dev only, destructive).
drop table if exists public.preprod_evals cascade;
