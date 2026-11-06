-- Autonomous MLBB Knowledge Engine: extended catalogs, sync jobs, provenance, versioning.
-- Preserves Original vs Advance separation; never silently overwrites history.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.knowledge_server_type as enum ('original', 'advance');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.knowledge_verification_status as enum (
    'unverified',
    'community',
    'official_pending',
    'verified',
    'rejected',
    'contradicted'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.knowledge_sync_job_kind as enum (
    'initial_ingestion',
    'patch_monitor',
    'official_verify',
    'community_meta_refresh',
    'consistency_audit',
    'manual_sync',
    'retry_failed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.knowledge_sync_job_status as enum (
    'queued',
    'running',
    'succeeded',
    'failed',
    'cancelled',
    'skipped_locked'
  );
exception when duplicate_object then null;
end $$;

-- Extend knowledge_source_type for autonomous discovery (additive).
do $$ begin
  alter type public.knowledge_source_type add value if not exists 'official_announcement';
  alter type public.knowledge_source_type add value if not exists 'official_website';
  alter type public.knowledge_source_type add value if not exists 'community_wiki';
  alter type public.knowledge_source_type add value if not exists 'community_esports';
  alter type public.knowledge_source_type add value if not exists 'discovered_feed';
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- Monitored sources (engine-level, not patch-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_monitored_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  source_key text not null,
  display_name text not null,
  source_type text not null,
  base_url text not null,
  discovery_method text not null default 'static_registry',
  server_type public.knowledge_server_type,
  enabled boolean not null default true,
  is_community boolean not null default false,
  respect_robots boolean not null default true,
  rate_limit_ms integer not null default 1500,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_key)
);

create index if not exists knowledge_monitored_sources_user_enabled_idx
  on public.knowledge_monitored_sources (user_id, enabled);

-- ---------------------------------------------------------------------------
-- Sync jobs + logs
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind public.knowledge_sync_job_kind not null,
  status public.knowledge_sync_job_status not null default 'queued',
  server_type public.knowledge_server_type,
  lock_owner text,
  lock_expires_at timestamptz,
  attempt integer not null default 0,
  max_attempts integer not null default 5,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  next_retry_at timestamptz,
  idempotency_key text not null,
  input_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists knowledge_sync_jobs_user_status_idx
  on public.knowledge_sync_jobs (user_id, status, scheduled_at);

create index if not exists knowledge_sync_jobs_lock_idx
  on public.knowledge_sync_jobs (status, lock_expires_at);

create table if not exists public.knowledge_sync_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.knowledge_sync_jobs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  level text not null default 'info',
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_sync_logs_job_idx
  on public.knowledge_sync_logs (job_id, created_at);

-- ---------------------------------------------------------------------------
-- Extended knowledge catalogs (items, emblems, spells, map, strategy, esports)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game_profile_id uuid not null references public.game_profiles (id) on delete cascade,
  server_type public.knowledge_server_type not null,
  patch_version text not null,
  item_key text not null,
  name text not null,
  category text not null default 'unknown',
  cost integer,
  attributes jsonb not null default '{}'::jsonb,
  passive_effects text not null default '',
  active_effects text not null default '',
  combinations jsonb not null default '[]'::jsonb,
  source text not null,
  source_url text,
  source_published_at timestamptz,
  first_discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  confidence_score numeric(4,3) not null default 0.500,
  verification_status public.knowledge_verification_status not null default 'unverified',
  record_version integer not null default 1,
  content_sha256 text,
  evidence_text text not null default '',
  unknown_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_profile_id, server_type, patch_version, item_key)
);

create index if not exists knowledge_items_lookup_idx
  on public.knowledge_items (user_id, server_type, patch_version);

create table if not exists public.knowledge_emblems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game_profile_id uuid not null references public.game_profiles (id) on delete cascade,
  server_type public.knowledge_server_type not null,
  patch_version text not null,
  emblem_key text not null,
  name text not null,
  talents jsonb not null default '[]'::jsonb,
  source text not null,
  source_url text,
  source_published_at timestamptz,
  first_discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  confidence_score numeric(4,3) not null default 0.500,
  verification_status public.knowledge_verification_status not null default 'unverified',
  record_version integer not null default 1,
  content_sha256 text,
  evidence_text text not null default '',
  unknown_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_profile_id, server_type, patch_version, emblem_key)
);

create table if not exists public.knowledge_battle_spells (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game_profile_id uuid not null references public.game_profiles (id) on delete cascade,
  server_type public.knowledge_server_type not null,
  patch_version text not null,
  spell_key text not null,
  name text not null,
  cooldown_seconds numeric,
  effects text not null default '',
  usage_notes text not null default '',
  source text not null,
  source_url text,
  source_published_at timestamptz,
  first_discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  confidence_score numeric(4,3) not null default 0.500,
  verification_status public.knowledge_verification_status not null default 'unverified',
  record_version integer not null default 1,
  content_sha256 text,
  evidence_text text not null default '',
  unknown_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_profile_id, server_type, patch_version, spell_key)
);

create table if not exists public.knowledge_maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game_profile_id uuid not null references public.game_profiles (id) on delete cascade,
  server_type public.knowledge_server_type not null,
  patch_version text not null,
  map_key text not null default 'land_of_dawn',
  name text not null,
  lanes jsonb not null default '[]'::jsonb,
  jungle_areas jsonb not null default '[]'::jsonb,
  objective_mechanics jsonb not null default '{}'::jsonb,
  terminology jsonb not null default '{}'::jsonb,
  source text not null,
  source_url text,
  source_published_at timestamptz,
  first_discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  confidence_score numeric(4,3) not null default 0.500,
  verification_status public.knowledge_verification_status not null default 'unverified',
  record_version integer not null default 1,
  content_sha256 text,
  evidence_text text not null default '',
  unknown_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_profile_id, server_type, patch_version, map_key)
);

create table if not exists public.knowledge_monsters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game_profile_id uuid not null references public.game_profiles (id) on delete cascade,
  server_type public.knowledge_server_type not null,
  patch_version text not null,
  monster_key text not null,
  name text not null,
  monster_kind text not null default 'unknown',
  mechanics text not null default '',
  source text not null,
  source_url text,
  source_published_at timestamptz,
  first_discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  confidence_score numeric(4,3) not null default 0.500,
  verification_status public.knowledge_verification_status not null default 'unverified',
  record_version integer not null default 1,
  content_sha256 text,
  evidence_text text not null default '',
  unknown_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_profile_id, server_type, patch_version, monster_key)
);

create table if not exists public.knowledge_patches_ext (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game_profile_id uuid not null references public.game_profiles (id) on delete cascade,
  game_patch_id uuid references public.game_patches (id) on delete set null,
  server_type public.knowledge_server_type not null,
  patch_identifier text not null,
  release_date timestamptz,
  summary_json jsonb not null default '{}'::jsonb,
  new_heroes jsonb not null default '[]'::jsonb,
  hero_buffs jsonb not null default '[]'::jsonb,
  hero_nerfs jsonb not null default '[]'::jsonb,
  item_changes jsonb not null default '[]'::jsonb,
  gameplay_changes jsonb not null default '[]'::jsonb,
  strategic_implications text not null default '',
  sources jsonb not null default '[]'::jsonb,
  content_sha256 text,
  related_advance_patch_id uuid references public.knowledge_patches_ext (id) on delete set null,
  related_original_patch_id uuid references public.knowledge_patches_ext (id) on delete set null,
  first_discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  confidence_score numeric(4,3) not null default 0.500,
  verification_status public.knowledge_verification_status not null default 'unverified',
  record_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_profile_id, server_type, patch_identifier)
);

create table if not exists public.knowledge_patch_changes (
  id uuid primary key default gen_random_uuid(),
  patch_ext_id uuid not null references public.knowledge_patches_ext (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  change_kind text not null,
  target_kind text not null,
  target_key text not null,
  summary text not null,
  before_json jsonb not null default '{}'::jsonb,
  after_json jsonb not null default '{}'::jsonb,
  evidence_text text not null default '',
  source_url text,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_patch_changes_patch_idx
  on public.knowledge_patch_changes (patch_ext_id);

create table if not exists public.knowledge_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game_profile_id uuid not null references public.game_profiles (id) on delete cascade,
  server_type public.knowledge_server_type not null,
  patch_version text not null,
  strategy_key text not null,
  title text not null,
  category text not null default 'meta',
  body text not null default '',
  hero_keys jsonb not null default '[]'::jsonb,
  is_community boolean not null default true,
  source text not null,
  source_url text,
  source_published_at timestamptz,
  first_discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  confidence_score numeric(4,3) not null default 0.400,
  verification_status public.knowledge_verification_status not null default 'community',
  record_version integer not null default 1,
  content_sha256 text,
  evidence_text text not null default '',
  unknown_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_profile_id, server_type, patch_version, strategy_key)
);

create table if not exists public.knowledge_esports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game_profile_id uuid not null references public.game_profiles (id) on delete cascade,
  server_type public.knowledge_server_type not null default 'original',
  record_key text not null,
  title text not null,
  category text not null default 'tournament',
  body_json jsonb not null default '{}'::jsonb,
  source text not null,
  source_url text,
  source_published_at timestamptz,
  first_discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  confidence_score numeric(4,3) not null default 0.500,
  verification_status public.knowledge_verification_status not null default 'community',
  record_version integer not null default 1,
  content_sha256 text,
  evidence_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, game_profile_id, record_key)
);

create table if not exists public.knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  entity_table text not null,
  entity_id uuid not null,
  record_version integer not null,
  snapshot_json jsonb not null,
  change_summary text not null default '',
  content_sha256 text,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_versions_entity_idx
  on public.knowledge_versions (entity_table, entity_id, record_version desc);

create table if not exists public.knowledge_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  relationship_type text not null,
  from_table text not null,
  from_id uuid not null,
  to_table text not null,
  to_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, relationship_type, from_table, from_id, to_table, to_id)
);

create table if not exists public.knowledge_ingestion_hashes (
  user_id uuid not null references public.users (id) on delete cascade,
  content_sha256 text not null,
  source_key text not null,
  server_type public.knowledge_server_type,
  last_status text not null,
  entity_ref text,
  updated_at timestamptz not null default now(),
  primary key (user_id, content_sha256)
);

create table if not exists public.knowledge_engine_state (
  user_id uuid primary key references public.users (id) on delete cascade,
  activated boolean not null default false,
  scheduler_config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  next_sync_at timestamptz,
  last_initial_ingestion_at timestamptz,
  stats_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Provenance columns on hero_knowledge (additive; Match Studio continues to use existing rows)
alter table public.hero_knowledge
  add column if not exists source text,
  add column if not exists source_url text,
  add column if not exists source_published_at timestamptz,
  add column if not exists first_discovered_at timestamptz,
  add column if not exists last_verified_at timestamptz,
  add column if not exists confidence_score numeric(4,3),
  add column if not exists verification_status text,
  add column if not exists record_version integer default 1,
  add column if not exists content_sha256 text,
  add column if not exists evidence_text text default '';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists knowledge_monitored_sources_set_updated_at on public.knowledge_monitored_sources;
create trigger knowledge_monitored_sources_set_updated_at
before update on public.knowledge_monitored_sources
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_sync_jobs_set_updated_at on public.knowledge_sync_jobs;
create trigger knowledge_sync_jobs_set_updated_at
before update on public.knowledge_sync_jobs
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_items_set_updated_at on public.knowledge_items;
create trigger knowledge_items_set_updated_at
before update on public.knowledge_items
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_emblems_set_updated_at on public.knowledge_emblems;
create trigger knowledge_emblems_set_updated_at
before update on public.knowledge_emblems
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_battle_spells_set_updated_at on public.knowledge_battle_spells;
create trigger knowledge_battle_spells_set_updated_at
before update on public.knowledge_battle_spells
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_maps_set_updated_at on public.knowledge_maps;
create trigger knowledge_maps_set_updated_at
before update on public.knowledge_maps
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_monsters_set_updated_at on public.knowledge_monsters;
create trigger knowledge_monsters_set_updated_at
before update on public.knowledge_monsters
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_patches_ext_set_updated_at on public.knowledge_patches_ext;
create trigger knowledge_patches_ext_set_updated_at
before update on public.knowledge_patches_ext
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_strategies_set_updated_at on public.knowledge_strategies;
create trigger knowledge_strategies_set_updated_at
before update on public.knowledge_strategies
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_esports_set_updated_at on public.knowledge_esports;
create trigger knowledge_esports_set_updated_at
before update on public.knowledge_esports
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_engine_state_set_updated_at on public.knowledge_engine_state;
create trigger knowledge_engine_state_set_updated_at
before update on public.knowledge_engine_state
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.knowledge_monitored_sources enable row level security;
alter table public.knowledge_sync_jobs enable row level security;
alter table public.knowledge_sync_logs enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.knowledge_emblems enable row level security;
alter table public.knowledge_battle_spells enable row level security;
alter table public.knowledge_maps enable row level security;
alter table public.knowledge_monsters enable row level security;
alter table public.knowledge_patches_ext enable row level security;
alter table public.knowledge_patch_changes enable row level security;
alter table public.knowledge_strategies enable row level security;
alter table public.knowledge_esports enable row level security;
alter table public.knowledge_versions enable row level security;
alter table public.knowledge_relationships enable row level security;
alter table public.knowledge_ingestion_hashes enable row level security;
alter table public.knowledge_engine_state enable row level security;

drop policy if exists knowledge_monitored_sources_owner on public.knowledge_monitored_sources;
create policy knowledge_monitored_sources_owner on public.knowledge_monitored_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_sync_jobs_owner on public.knowledge_sync_jobs;
create policy knowledge_sync_jobs_owner on public.knowledge_sync_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_sync_logs_owner on public.knowledge_sync_logs;
create policy knowledge_sync_logs_owner on public.knowledge_sync_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_items_owner on public.knowledge_items;
create policy knowledge_items_owner on public.knowledge_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_emblems_owner on public.knowledge_emblems;
create policy knowledge_emblems_owner on public.knowledge_emblems
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_battle_spells_owner on public.knowledge_battle_spells;
create policy knowledge_battle_spells_owner on public.knowledge_battle_spells
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_maps_owner on public.knowledge_maps;
create policy knowledge_maps_owner on public.knowledge_maps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_monsters_owner on public.knowledge_monsters;
create policy knowledge_monsters_owner on public.knowledge_monsters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_patches_ext_owner on public.knowledge_patches_ext;
create policy knowledge_patches_ext_owner on public.knowledge_patches_ext
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_patch_changes_owner on public.knowledge_patch_changes;
create policy knowledge_patch_changes_owner on public.knowledge_patch_changes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_strategies_owner on public.knowledge_strategies;
create policy knowledge_strategies_owner on public.knowledge_strategies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_esports_owner on public.knowledge_esports;
create policy knowledge_esports_owner on public.knowledge_esports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_versions_owner on public.knowledge_versions;
create policy knowledge_versions_owner on public.knowledge_versions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_relationships_owner on public.knowledge_relationships;
create policy knowledge_relationships_owner on public.knowledge_relationships
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_ingestion_hashes_owner on public.knowledge_ingestion_hashes;
create policy knowledge_ingestion_hashes_owner on public.knowledge_ingestion_hashes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists knowledge_engine_state_owner on public.knowledge_engine_state;
create policy knowledge_engine_state_owner on public.knowledge_engine_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
