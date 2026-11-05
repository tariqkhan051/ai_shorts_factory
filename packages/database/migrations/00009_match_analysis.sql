-- Milestone 3: match video ingest + roster OCR analysis cache.

do $$ begin
  create type public.match_analysis_status as enum (
    'pending', 'sampling', 'ocr', 'mapping', 'completed', 'failed', 'cached'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.match_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  storage_key text,
  local_path text,
  content_checksum_sha256 text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  duration_seconds double precision,
  server_environment public.game_server_environment not null,
  game_patch_id uuid not null references public.game_patches (id) on delete restrict,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists match_sources_user_id_idx on public.match_sources (user_id);
create index if not exists match_sources_game_patch_id_idx on public.match_sources (game_patch_id);

create table if not exists public.match_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  match_source_id uuid not null references public.match_sources (id) on delete cascade,
  status public.match_analysis_status not null default 'pending',
  cache_key text not null,
  recognition_config jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_source_id, cache_key)
);

create index if not exists match_analysis_jobs_user_id_idx on public.match_analysis_jobs (user_id);
create index if not exists match_analysis_jobs_cache_key_idx on public.match_analysis_jobs (cache_key);

drop trigger if exists match_sources_set_updated_at on public.match_sources;
create trigger match_sources_set_updated_at
before update on public.match_sources
for each row execute function public.set_updated_at();

drop trigger if exists match_analysis_jobs_set_updated_at on public.match_analysis_jobs;
create trigger match_analysis_jobs_set_updated_at
before update on public.match_analysis_jobs
for each row execute function public.set_updated_at();

alter table public.match_sources enable row level security;
alter table public.match_analysis_jobs enable row level security;

drop policy if exists match_sources_all_own on public.match_sources;
create policy match_sources_all_own on public.match_sources
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists match_analysis_jobs_all_own on public.match_analysis_jobs;
create policy match_analysis_jobs_all_own on public.match_analysis_jobs
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
