-- Manual rollback for 20261009000000_init_vani_lab.sql (Supabase CLI has no automatic down migrations).
-- Destructive: drops all VANI Lab tables. Run only on a dev database or after a backup.
drop table if exists public.notification_preferences, public.notifications,
  public.autoscale_decisions, public.autoscale_state, public.autoscale_settings,
  public.traffic_allocations, public.audits, public.calls, public.rubrics,
  public.experiments, public.versions cascade;
drop function if exists public.decisions_append_only();
drop function if exists public.versions_immutable();
