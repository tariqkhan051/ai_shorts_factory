-- Milestone 6: event-based match edit plans + rendered artifacts (approval before distribution).

create table if not exists public.match_edit_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  timeline_id uuid not null,
  match_source_id uuid not null,
  server_environment text not null check (server_environment in ('original', 'advance')),
  game_patch_id uuid not null,
  plan_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_edit_plans_user_timeline_idx
  on public.match_edit_plans (user_id, timeline_id);

create table if not exists public.match_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.match_edit_plans (id) on delete cascade,
  timeline_id uuid not null,
  match_source_id uuid not null,
  status text not null check (status in ('planned', 'rendered', 'approved', 'rejected')),
  artifacts_json jsonb not null default '[]'::jsonb,
  approved_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_edits_user_status_idx
  on public.match_edits (user_id, status);

alter table public.match_edit_plans enable row level security;
alter table public.match_edits enable row level security;

create policy match_edit_plans_owner on public.match_edit_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy match_edits_owner on public.match_edits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
