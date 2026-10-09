-- Pre-prod gate runs: synthetic scenario results per prompt version.
create table public.preprod_evals (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  version_id  text generated always as (data->>'versionId') stored,
  status      text generated always as (data->>'status') stored,
  is_real     boolean generated always as ((data->>'real')::boolean) stored,
  constraint preprod_status_check check (status in ('running','done','error')),
  constraint preprod_version_fk foreign key (version_id) references public.versions (id)
);
create index preprod_evals_version_idx on public.preprod_evals (version_id, created_at desc);

-- Backend-only, same stance as the other tables.
alter table public.preprod_evals enable row level security;
revoke all on public.preprod_evals from anon, authenticated;
