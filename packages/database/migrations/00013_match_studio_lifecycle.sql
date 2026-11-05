-- Match Studio lifecycle: bind recordings to projects, studio runs, nullable unknown patch.

alter table public.match_sources
  add column if not exists project_id uuid references public.projects (id) on delete set null;

alter table public.match_sources
  alter column game_patch_id drop not null;

alter table public.match_sources
  add column if not exists probe_json jsonb not null default '{}'::jsonb;

alter table public.match_sources
  add column if not exists ingest_status text not null default 'registered';

alter table public.match_sources
  add column if not exists original_filename text not null default '';

create index if not exists match_sources_project_id_idx on public.match_sources (project_id);

do $$ begin
  create type public.match_studio_status as enum (
    'draft',
    'awaiting_upload',
    'ingesting',
    'ready_for_analysis',
    'analyzing',
    'awaiting_timeline_review',
    'commentary_pending',
    'awaiting_commentary_review',
    'voice_pending',
    'awaiting_voice_approval',
    'edl_pending',
    'awaiting_edit_review',
    'rendering',
    'awaiting_final_approval',
    'completed',
    'failed',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.match_studio_patch_resolution as enum (
    'bound', 'unknown', 'draft_only'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.match_studio_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  match_source_id uuid references public.match_sources (id) on delete set null,
  title text not null,
  status public.match_studio_status not null default 'draft',
  patch_resolution public.match_studio_patch_resolution not null default 'bound',
  server_environment public.game_server_environment not null,
  game_profile_id uuid not null references public.game_profiles (id) on delete restrict,
  game_patch_id uuid references public.game_patches (id) on delete set null,
  last_error text,
  capability_flags jsonb not null default '{}'::jsonb,
  commentary_style text not null default 'esports_caster',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_studio_runs_user_id_idx on public.match_studio_runs (user_id);
create index if not exists match_studio_runs_project_id_idx on public.match_studio_runs (project_id);
create index if not exists match_studio_runs_status_idx on public.match_studio_runs (status);

drop trigger if exists match_studio_runs_set_updated_at on public.match_studio_runs;
create trigger match_studio_runs_set_updated_at
before update on public.match_studio_runs
for each row execute function public.set_updated_at();

alter table public.match_studio_runs enable row level security;

drop policy if exists match_studio_runs_all_own on public.match_studio_runs;
create policy match_studio_runs_all_own on public.match_studio_runs
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Hero aliases (Milestone 4 additive; included early for fewer migrations)
alter table public.hero_knowledge
  add column if not exists aliases text[] not null default '{}'::text[];
