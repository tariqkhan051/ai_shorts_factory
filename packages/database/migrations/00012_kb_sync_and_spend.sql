-- Milestone 7: KB artifact sync audit + match cache metrics (spend uses credit ledger entries).

create table if not exists public.kb_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  run_json jsonb not null,
  imported_draft_count integer not null default 0,
  skipped_unchanged_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists kb_sync_runs_user_created_idx
  on public.kb_sync_runs (user_id, created_at desc);

create table if not exists public.kb_sync_artifact_checksums (
  user_id uuid not null references auth.users (id) on delete cascade,
  content_sha256 text not null,
  path text not null,
  last_status text not null,
  draft_patch_id uuid,
  updated_at timestamptz not null default now(),
  primary key (user_id, content_sha256)
);

create table if not exists public.match_cache_metrics (
  user_id uuid primary key references auth.users (id) on delete cascade,
  metrics_json jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.kb_sync_runs enable row level security;
alter table public.kb_sync_artifact_checksums enable row level security;
alter table public.match_cache_metrics enable row level security;

create policy kb_sync_runs_owner on public.kb_sync_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy kb_sync_checksums_owner on public.kb_sync_artifact_checksums
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy match_cache_metrics_owner on public.match_cache_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
