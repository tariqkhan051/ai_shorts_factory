-- Milestone 9.2: commentary persistence + event correction audit trail.

create table if not exists public.match_commentary_scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  match_studio_run_id uuid references public.match_studio_runs (id) on delete set null,
  timeline_id uuid not null,
  match_source_id uuid not null references public.match_sources (id) on delete cascade,
  server_environment public.game_server_environment not null,
  game_patch_id uuid references public.game_patches (id) on delete set null,
  style text not null default 'esports_caster',
  approval_status text not null default 'draft',
  script_json jsonb not null default '{}'::jsonb,
  segments_json jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_commentary_scripts_user_id_idx
  on public.match_commentary_scripts (user_id);
create index if not exists match_commentary_scripts_run_id_idx
  on public.match_commentary_scripts (match_studio_run_id);
create index if not exists match_commentary_scripts_timeline_id_idx
  on public.match_commentary_scripts (timeline_id);

drop trigger if exists match_commentary_scripts_set_updated_at on public.match_commentary_scripts;
create trigger match_commentary_scripts_set_updated_at
before update on public.match_commentary_scripts
for each row execute function public.set_updated_at();

alter table public.match_commentary_scripts enable row level security;

drop policy if exists match_commentary_scripts_all_own on public.match_commentary_scripts;
create policy match_commentary_scripts_all_own on public.match_commentary_scripts
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Preserve machine predictions when humans correct events
alter table public.match_events
  add column if not exists original_prediction jsonb;

alter table public.match_events
  add column if not exists corrected_by uuid references public.users (id) on delete set null;

alter table public.match_events
  add column if not exists corrected_at timestamptz;

alter table public.match_events
  add column if not exists review_status text not null default 'pending';

comment on column public.match_events.original_prediction is
  'Snapshot of detector fields before the first human correction; never overwritten.';
comment on column public.match_events.review_status is
  'pending | approved | rejected — human review state independent of detector confidence.';
