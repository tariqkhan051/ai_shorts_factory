-- Milestone 4: match event timeline with pre/main/post windows and human corrections.

do $$ begin
  create type public.match_event_type as enum (
    'kill', 'turtle', 'lord', 'turret', 'teamfight', 'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.match_timeline_status as enum (
    'draft', 'proposed', 'corrected', 'approved'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.match_timelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  match_source_id uuid not null references public.match_sources (id) on delete cascade,
  status public.match_timeline_status not null default 'proposed',
  detection_config jsonb not null default '{}'::jsonb,
  cache_key text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_source_id, cache_key)
);

create index if not exists match_timelines_user_id_idx on public.match_timelines (user_id);
create index if not exists match_timelines_match_source_id_idx
  on public.match_timelines (match_source_id);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.match_timelines (id) on delete cascade,
  event_type public.match_event_type not null,
  timestamp_seconds double precision not null check (timestamp_seconds >= 0),
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  participants jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  windows jsonb not null default '[]'::jsonb,
  notes text not null default '',
  rejected boolean not null default false,
  source text not null default 'detector' check (source in ('detector', 'human')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_events_timeline_id_idx on public.match_events (timeline_id);
create index if not exists match_events_timeline_ts_idx
  on public.match_events (timeline_id, timestamp_seconds);

drop trigger if exists match_timelines_set_updated_at on public.match_timelines;
create trigger match_timelines_set_updated_at
before update on public.match_timelines
for each row execute function public.set_updated_at();

drop trigger if exists match_events_set_updated_at on public.match_events;
create trigger match_events_set_updated_at
before update on public.match_events
for each row execute function public.set_updated_at();

alter table public.match_timelines enable row level security;
alter table public.match_events enable row level security;

drop policy if exists match_timelines_all_own on public.match_timelines;
create policy match_timelines_all_own on public.match_timelines
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists match_events_all_own on public.match_events;
create policy match_events_all_own on public.match_events
  for all using (
    exists (
      select 1 from public.match_timelines t
      where t.id = timeline_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.match_timelines t
      where t.id = timeline_id and t.user_id = auth.uid()
    )
  );
