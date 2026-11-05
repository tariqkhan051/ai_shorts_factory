-- Content platform: Brand → Project → Video hierarchy + DNA + social/distribution stubs.
-- Preserves existing project / scene / story IDs. Backfills one Video per legacy Project.

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  logo_asset_id uuid references public.reference_assets (id) on delete set null,
  colors jsonb not null default '{}'::jsonb,
  default_watermark_asset_id uuid references public.reference_assets (id) on delete set null,
  target_audience text not null default '',
  brand_voice text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists brands_user_id_idx on public.brands (user_id);

-- ---------------------------------------------------------------------------
-- Extend projects
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists brand_id uuid references public.brands (id) on delete set null,
  add column if not exists niche text not null default '',
  add column if not exists content_purpose text not null default '',
  add column if not exists universe_context text not null default '',
  add column if not exists dna_current_version int not null default 0,
  add column if not exists legacy_single_video boolean not null default true;

create index if not exists projects_brand_id_idx on public.projects (brand_id);

-- ---------------------------------------------------------------------------
-- Project DNA versions (immutable)
-- ---------------------------------------------------------------------------
create table if not exists public.project_dna_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version int not null check (version > 0),
  snapshot jsonb not null,
  note text not null default '',
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create index if not exists project_dna_versions_project_id_idx
  on public.project_dna_versions (project_id);

-- ---------------------------------------------------------------------------
-- Videos (production unit inside a Project)
-- ---------------------------------------------------------------------------
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null default '',
  concept text not null default '',
  story_brief text not null default '',
  special_instructions text not null default '',
  workflow_state public.workflow_state not null default 'IDEA_SUBMITTED',
  captions_on_video boolean not null default false,
  project_dna_version int not null default 1,
  context_snapshot jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists videos_project_id_idx on public.videos (project_id);
create index if not exists videos_user_id_idx on public.videos (user_id);
create index if not exists videos_workflow_state_idx on public.videos (workflow_state);

-- ---------------------------------------------------------------------------
-- Environments (project-scoped library)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.environment_kind as enum (
    'location', 'room', 'landscape', 'battlefield', 'building', 'fictional', 'prop', 'other'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.environments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  kind public.environment_kind not null default 'location',
  description text not null default '',
  visual_identity text not null default '',
  continuity_rules text not null default '',
  reference_image_prompt text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists environments_project_id_idx on public.environments (project_id);

-- ---------------------------------------------------------------------------
-- Social accounts + project mapping
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.social_platform as enum ('youtube', 'facebook', 'instagram', 'tiktok');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.social_connection_status as enum ('registered', 'connected', 'error', 'revoked');
exception when duplicate_object then null;
end $$;

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  platform public.social_platform not null,
  display_name text not null,
  handle text not null,
  connection_status public.social_connection_status not null default 'registered',
  publishing_enabled boolean not null default false,
  default_caption_rules text not null default '',
  default_hashtag_rules text not null default '',
  default_content_format text not null default '9:16',
  account_preferences jsonb not null default '{}'::jsonb,
  secret_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists social_accounts_user_id_idx on public.social_accounts (user_id);
create index if not exists social_accounts_brand_id_idx on public.social_accounts (brand_id);

create table if not exists public.project_social_accounts (
  project_id uuid not null references public.projects (id) on delete cascade,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (project_id, social_account_id)
);

-- ---------------------------------------------------------------------------
-- Video distributions
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.distribution_status as enum (
    'draft', 'ready', 'scheduled', 'published_manual', 'published', 'failed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.video_distributions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  platform public.social_platform not null,
  target_format text not null default '9:16',
  caption text not null default '',
  hashtags jsonb not null default '[]'::jsonb,
  thumbnail_asset_id uuid references public.reference_assets (id) on delete set null,
  derived_asset_id uuid,
  status public.distribution_status not null default 'draft',
  scheduled_at timestamptz,
  published_url text,
  platform_reference_id text,
  failure_reason text,
  retry_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_distributions_video_id_idx on public.video_distributions (video_id);
create index if not exists video_distributions_project_id_idx on public.video_distributions (project_id);

-- ---------------------------------------------------------------------------
-- Add nullable video_id to production tables (backfilled below)
-- ---------------------------------------------------------------------------
alter table public.stories add column if not exists video_id uuid references public.videos (id) on delete set null;
alter table public.scenes add column if not exists video_id uuid references public.videos (id) on delete set null;
alter table public.generation_jobs add column if not exists video_id uuid references public.videos (id) on delete set null;
alter table public.generated_assets add column if not exists video_id uuid references public.videos (id) on delete set null;
alter table public.video_outputs add column if not exists video_id uuid references public.videos (id) on delete set null;
alter table public.approvals add column if not exists video_id uuid references public.videos (id) on delete set null;
alter table public.workflow_jobs add column if not exists video_id uuid references public.videos (id) on delete set null;
alter table public.credit_ledger add column if not exists video_id uuid references public.videos (id) on delete set null;
alter table public.notifications add column if not exists video_id uuid references public.videos (id) on delete set null;

create index if not exists stories_video_id_idx on public.stories (video_id);
create index if not exists scenes_video_id_idx on public.scenes (video_id);
create index if not exists generation_jobs_video_id_idx on public.generation_jobs (video_id);

-- ---------------------------------------------------------------------------
-- Data backfill: Personal brand + DNA v1 + one Video per existing project
-- ---------------------------------------------------------------------------
insert into public.brands (user_id, name, description)
select u.id, 'Personal', 'Default brand for migrated and unassigned projects'
from public.users u
where not exists (
  select 1 from public.brands b
  where b.user_id = u.id and b.name = 'Personal' and b.deleted_at is null
);

update public.projects p
set brand_id = b.id
from public.brands b
where b.user_id = p.user_id
  and b.name = 'Personal'
  and b.deleted_at is null
  and p.brand_id is null;

insert into public.project_dna_versions (project_id, version, snapshot, note, created_by)
select
  p.id,
  1,
  jsonb_build_object(
    'identity', jsonb_build_object(
      'name', p.name,
      'description', coalesce(p.notes, ''),
      'brand_id', p.brand_id,
      'content_niche', coalesce(p.niche, ''),
      'target_audience', coalesce(p.target_audience, ''),
      'language', coalesce(p.language, 'en'),
      'primary_content_category', p.category::text,
      'content_purpose', coalesce(p.content_purpose, ''),
      'universe_context', coalesce(p.universe_context, '')
    ),
    'visual', jsonb_build_object(
      'default_visual_style', p.visual_style::text,
      'style_preferences', '[]'::jsonb,
      'color_palette', '[]'::jsonb,
      'lighting_direction', '',
      'camera_language', '',
      'character_rendering_style', '',
      'environment_style', '',
      'logo_asset_id', null,
      'watermark_asset_id', null,
      'visual_continuity_rules', ''
    ),
    'storytelling', jsonb_build_object(
      'default_narrative_structure', '',
      'preferred_hooks', '[]'::jsonb,
      'tone', '',
      'pacing', '',
      'ending_style', '',
      'dialogue_conventions', '',
      'content_restrictions', '',
      'storytelling_examples', '[]'::jsonb,
      'reference_video_notes', ''
    ),
    'production_defaults', jsonb_build_object(
      'aspect_ratio', '9:16',
      'target_duration_seconds', 40,
      'scene_count', 5,
      'default_scene_duration_seconds', 8,
      'target_resolution', '720p',
      'fps', 30,
      'subtitle_caption_style', '',
      'audio_direction', '',
      'captions_on_video', coalesce(p.captions_on_video, false),
      'default_generation_settings', '{}'::jsonb
    ),
    'prompt_instructions', jsonb_build_object(
      'permanent_project_instructions', '',
      'screenplay_generation_instructions', '',
      'scene_prompt_instructions', '',
      'character_continuity_instructions', '',
      'negative_prompt_rules', ''
    )
  ),
  'Migrated initial Project DNA',
  p.user_id
from public.projects p
where not exists (
  select 1 from public.project_dna_versions d where d.project_id = p.id
);

update public.projects p
set dna_current_version = 1
where p.dna_current_version = 0
  and exists (select 1 from public.project_dna_versions d where d.project_id = p.id and d.version = 1);

insert into public.videos (
  project_id, user_id, title, concept, story_brief, special_instructions,
  workflow_state, captions_on_video, project_dna_version, context_snapshot
)
select
  p.id,
  p.user_id,
  p.name,
  coalesce(nullif(trim(pi.idea), ''), p.name, 'Migrated legacy project'),
  coalesce(pi.existing_story, ''),
  trim(both from concat_ws(E'\n\n', nullif(pi.additional_instructions, ''), nullif(pi.character_reference_notes, ''))),
  p.workflow_state,
  coalesce(p.captions_on_video, false),
  greatest(p.dna_current_version, 1),
  jsonb_build_object(
    'project_id', p.id,
    'project_dna_version', greatest(p.dna_current_version, 1),
    'content_niche', coalesce(p.niche, ''),
    'visual_style', p.visual_style::text,
    'language', coalesce(p.language, 'en'),
    'target_audience', coalesce(p.target_audience, ''),
    'continuity_policy', 'reuse existing project characters',
    'production_defaults', jsonb_build_object('captions_on_video', coalesce(p.captions_on_video, false)),
    'prompt_instructions', '{}'::jsonb
  )
from public.projects p
left join public.project_inputs pi on pi.project_id = p.id
where p.deleted_at is null
  and not exists (select 1 from public.videos v where v.project_id = p.id and v.deleted_at is null);

update public.projects set legacy_single_video = true
where exists (
  select 1 from public.videos v
  where v.project_id = projects.id and v.deleted_at is null
)
and (
  select count(*) from public.videos v2
  where v2.project_id = projects.id and v2.deleted_at is null
) = 1;

-- Backfill video_id on child rows using the sole/migrated video per project
update public.stories s
set video_id = v.id
from public.videos v
where v.project_id = s.project_id
  and s.video_id is null;

update public.scenes s
set video_id = v.id
from public.videos v
where v.project_id = s.project_id
  and s.video_id is null;

update public.generation_jobs j
set video_id = v.id
from public.videos v
where v.project_id = j.project_id
  and j.video_id is null;

update public.generated_assets a
set video_id = v.id
from public.videos v
where v.project_id = a.project_id
  and a.video_id is null;

update public.video_outputs o
set video_id = v.id
from public.videos v
where v.project_id = o.project_id
  and o.video_id is null;

update public.approvals a
set video_id = v.id
from public.videos v
where v.project_id = a.project_id
  and a.video_id is null;

update public.workflow_jobs w
set video_id = v.id
from public.videos v
where v.project_id = w.project_id
  and w.video_id is null;

update public.credit_ledger c
set video_id = v.id
from public.videos v
where v.project_id = c.project_id
  and c.video_id is null
  and c.project_id is not null;

update public.notifications n
set video_id = v.id
from public.videos v
where v.project_id = n.project_id
  and n.video_id is null
  and n.project_id is not null;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at
before update on public.brands
for each row execute function public.set_updated_at();

drop trigger if exists videos_set_updated_at on public.videos;
create trigger videos_set_updated_at
before update on public.videos
for each row execute function public.set_updated_at();

drop trigger if exists environments_set_updated_at on public.environments;
create trigger environments_set_updated_at
before update on public.environments
for each row execute function public.set_updated_at();

drop trigger if exists social_accounts_set_updated_at on public.social_accounts;
create trigger social_accounts_set_updated_at
before update on public.social_accounts
for each row execute function public.set_updated_at();

drop trigger if exists video_distributions_set_updated_at on public.video_distributions;
create trigger video_distributions_set_updated_at
before update on public.video_distributions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.brands enable row level security;
alter table public.project_dna_versions enable row level security;
alter table public.videos enable row level security;
alter table public.environments enable row level security;
alter table public.social_accounts enable row level security;
alter table public.project_social_accounts enable row level security;
alter table public.video_distributions enable row level security;

drop policy if exists brands_all_own on public.brands;
create policy brands_all_own on public.brands
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists project_dna_versions_all_own on public.project_dna_versions;
create policy project_dna_versions_all_own on public.project_dna_versions
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists videos_all_own on public.videos;
create policy videos_all_own on public.videos
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists environments_all_own on public.environments;
create policy environments_all_own on public.environments
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists social_accounts_all_own on public.social_accounts;
create policy social_accounts_all_own on public.social_accounts
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists project_social_accounts_all_own on public.project_social_accounts;
create policy project_social_accounts_all_own on public.project_social_accounts
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists video_distributions_all_own on public.video_distributions;
create policy video_distributions_all_own on public.video_distributions
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );
