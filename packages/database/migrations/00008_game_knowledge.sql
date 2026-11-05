-- Milestone 1: Game knowledge base + Original/Advance patch activation binding.
-- Enforces: draft ≠ active; published KB immutable (app-layer); environment match on bind.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.game_server_environment as enum ('original', 'advance');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.game_patch_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.hero_ability_slot as enum (
    'passive', 'skill1', 'skill2', 'ultimate', 'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.knowledge_source_type as enum (
    'official_patch_notes',
    'official_hero_page',
    'research_report',
    'manual_entry',
    'other'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Game profiles
-- ---------------------------------------------------------------------------
create table if not exists public.game_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  terminology jsonb not null default '{}'::jsonb,
  gameplay_rules text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, slug)
);

create index if not exists game_profiles_user_id_idx on public.game_profiles (user_id);

-- Per-environment recognition / terminology overlays (Original vs Advance).
create table if not exists public.game_server_profiles (
  id uuid primary key default gen_random_uuid(),
  game_profile_id uuid not null references public.game_profiles (id) on delete cascade,
  environment public.game_server_environment not null,
  terminology jsonb not null default '{}'::jsonb,
  recognition_config jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_profile_id, environment)
);

create index if not exists game_server_profiles_game_profile_id_idx
  on public.game_server_profiles (game_profile_id);

-- ---------------------------------------------------------------------------
-- Patches (versioned knowledge snapshots per server environment)
-- ---------------------------------------------------------------------------
create table if not exists public.game_patches (
  id uuid primary key default gen_random_uuid(),
  game_profile_id uuid not null references public.game_profiles (id) on delete cascade,
  server_environment public.game_server_environment not null,
  patch_code text not null,
  title text not null,
  effective_from timestamptz,
  effective_to timestamptz,
  status public.game_patch_status not null default 'draft',
  notes text not null default '',
  previous_patch_id uuid references public.game_patches (id) on delete set null,
  published_at timestamptz,
  published_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_profile_id, server_environment, patch_code)
);

create index if not exists game_patches_profile_env_status_idx
  on public.game_patches (game_profile_id, server_environment, status);

create index if not exists game_patches_previous_patch_id_idx
  on public.game_patches (previous_patch_id);

-- ---------------------------------------------------------------------------
-- Sources, heroes, abilities
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  game_patch_id uuid not null references public.game_patches (id) on delete cascade,
  source_type public.knowledge_source_type not null default 'manual_entry',
  title text not null,
  url text,
  published_at timestamptz,
  retrieved_at timestamptz,
  checksum_sha256 text,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists knowledge_sources_game_patch_id_idx
  on public.knowledge_sources (game_patch_id);

create table if not exists public.hero_knowledge (
  id uuid primary key default gen_random_uuid(),
  game_patch_id uuid not null references public.game_patches (id) on delete cascade,
  hero_key text not null,
  name text not null,
  roles jsonb not null default '[]'::jsonb,
  lanes jsonb not null default '[]'::jsonb,
  description text not null default '',
  passive jsonb not null default '{}'::jsonb,
  damage_types jsonb not null default '[]'::jsonb,
  cc_types jsonb not null default '[]'::jsonb,
  sound_signature_notes text not null default '',
  revamp_notes text not null default '',
  portrait_asset_id uuid references public.reference_assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_patch_id, hero_key)
);

create index if not exists hero_knowledge_game_patch_id_idx
  on public.hero_knowledge (game_patch_id);

create table if not exists public.ability_knowledge (
  id uuid primary key default gen_random_uuid(),
  hero_knowledge_id uuid not null references public.hero_knowledge (id) on delete cascade,
  ability_key text not null,
  slot public.hero_ability_slot not null,
  name text not null,
  description text not null default '',
  effects text not null default '',
  damage_types jsonb not null default '[]'::jsonb,
  cc_types jsonb not null default '[]'::jsonb,
  experimental boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hero_knowledge_id, ability_key)
);

create index if not exists ability_knowledge_hero_knowledge_id_idx
  on public.ability_knowledge (hero_knowledge_id);

-- ---------------------------------------------------------------------------
-- Activation binding on projects + videos
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists game_profile_id uuid references public.game_profiles (id) on delete set null,
  add column if not exists game_server_environment public.game_server_environment,
  add column if not exists active_game_patch_id uuid references public.game_patches (id) on delete set null;

create index if not exists projects_game_profile_id_idx on public.projects (game_profile_id);
create index if not exists projects_active_game_patch_id_idx on public.projects (active_game_patch_id);

alter table public.videos
  add column if not exists game_server_environment public.game_server_environment,
  add column if not exists game_patch_id uuid references public.game_patches (id) on delete set null;

create index if not exists videos_game_patch_id_idx on public.videos (game_patch_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists game_profiles_set_updated_at on public.game_profiles;
create trigger game_profiles_set_updated_at
before update on public.game_profiles
for each row execute function public.set_updated_at();

drop trigger if exists game_server_profiles_set_updated_at on public.game_server_profiles;
create trigger game_server_profiles_set_updated_at
before update on public.game_server_profiles
for each row execute function public.set_updated_at();

drop trigger if exists game_patches_set_updated_at on public.game_patches;
create trigger game_patches_set_updated_at
before update on public.game_patches
for each row execute function public.set_updated_at();

drop trigger if exists hero_knowledge_set_updated_at on public.hero_knowledge;
create trigger hero_knowledge_set_updated_at
before update on public.hero_knowledge
for each row execute function public.set_updated_at();

drop trigger if exists ability_knowledge_set_updated_at on public.ability_knowledge;
create trigger ability_knowledge_set_updated_at
before update on public.ability_knowledge
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.game_profiles enable row level security;
alter table public.game_server_profiles enable row level security;
alter table public.game_patches enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.hero_knowledge enable row level security;
alter table public.ability_knowledge enable row level security;

drop policy if exists game_profiles_all_own on public.game_profiles;
create policy game_profiles_all_own on public.game_profiles
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists game_server_profiles_all_own on public.game_server_profiles;
create policy game_server_profiles_all_own on public.game_server_profiles
  for all using (
    exists (
      select 1 from public.game_profiles g
      where g.id = game_profile_id and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.game_profiles g
      where g.id = game_profile_id and g.user_id = auth.uid()
    )
  );

drop policy if exists game_patches_all_own on public.game_patches;
create policy game_patches_all_own on public.game_patches
  for all using (
    exists (
      select 1 from public.game_profiles g
      where g.id = game_profile_id and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.game_profiles g
      where g.id = game_profile_id and g.user_id = auth.uid()
    )
  );

drop policy if exists knowledge_sources_all_own on public.knowledge_sources;
create policy knowledge_sources_all_own on public.knowledge_sources
  for all using (
    exists (
      select 1
      from public.game_patches p
      join public.game_profiles g on g.id = p.game_profile_id
      where p.id = game_patch_id and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.game_patches p
      join public.game_profiles g on g.id = p.game_profile_id
      where p.id = game_patch_id and g.user_id = auth.uid()
    )
  );

drop policy if exists hero_knowledge_all_own on public.hero_knowledge;
create policy hero_knowledge_all_own on public.hero_knowledge
  for all using (
    exists (
      select 1
      from public.game_patches p
      join public.game_profiles g on g.id = p.game_profile_id
      where p.id = game_patch_id and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.game_patches p
      join public.game_profiles g on g.id = p.game_profile_id
      where p.id = game_patch_id and g.user_id = auth.uid()
    )
  );

drop policy if exists ability_knowledge_all_own on public.ability_knowledge;
create policy ability_knowledge_all_own on public.ability_knowledge
  for all using (
    exists (
      select 1
      from public.hero_knowledge h
      join public.game_patches p on p.id = h.game_patch_id
      join public.game_profiles g on g.id = p.game_profile_id
      where h.id = hero_knowledge_id and g.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.hero_knowledge h
      join public.game_patches p on p.id = h.game_patch_id
      join public.game_profiles g on g.id = p.game_profile_id
      where h.id = hero_knowledge_id and g.user_id = auth.uid()
    )
  );
