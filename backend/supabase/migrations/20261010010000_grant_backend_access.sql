-- Backend access only. The browser roles remain revoked and RLS stays enabled.
-- The API uses Supabase's server-side secret key, mapped to service_role.
grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.versions,
  public.experiments,
  public.rubrics,
  public.calls,
  public.audits,
  public.traffic_allocations,
  public.autoscale_settings,
  public.autoscale_state,
  public.autoscale_decisions,
  public.notifications,
  public.notification_preferences,
  public.preprod_evals
to service_role;

-- Created by the staged-rollout migration; kept here for deployments applying
-- the grant migration after all schema migrations in timestamp order.
grant select, insert, update, delete on table
  public.rollout_runs,
  public.rollout_decisions
to service_role;
