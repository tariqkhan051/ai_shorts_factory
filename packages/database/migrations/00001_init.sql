-- AI Shorts Factory — Phase 1 schema
-- Apply via Supabase SQL editor or `supabase db push`.
-- UUID primary keys, FKs, indexes, RLS enabled.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.workflow_state as enum (
    'IDEA_SUBMITTED',
    'STORY_PROMPT_READY',
    'WAITING_FOR_CHATGPT',
    'STORY_IMPORTED',
    'STORY_VALIDATION',
    'STORY_APPROVAL',
    'SCENE_PREPARATION',
    'READY_FOR_GENERATION',
    'CREDIT_RESERVED',
    'GENERATING_SCENES',
    'VERIFYING_SCENES',
    'ASSEMBLY_READY',
    'ASSEMBLING',
    'QUALITY_CHECK',
    'COMPLETED',
    'FINAL_APPROVAL',
    'APPROVED',
    'PAUSED',
    'FAILED',
    'CANCELLED',
    'NEEDS_HUMAN_INTERVENTION'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.scene_state as enum (
    'PENDING',
    'GENERATING',
    'DOWNLOADING',
    'VERIFYING',
    'COMPLETED',
    'FAILED',
    'NEEDS_ATTENTION'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.content_category as enum (
    'fictional_story',
    'cinematic',
    'anime',
    'educational',
    'documentary',
    'kids_cartoon',
    'gaming',
    'romantic_emotional',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.visual_style as enum (
    'automatic',
    'realistic_cinematic',
    'anime',
    '2d_animation',
    '3d_cartoon',
    'documentary',
    'educational_motion_graphics',
    'custom'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- users (profile linked to auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  timezone text not null default 'Asia/Karachi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  category public.content_category not null default 'other',
  visual_style public.visual_style not null default 'automatic',
  language text not null default 'en',
  target_audience text not null default '',
  workflow_state public.workflow_state not null default 'IDEA_SUBMITTED',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_workflow_state_idx on public.projects (workflow_state);
create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- project_inputs (idea / creative brief)
-- ---------------------------------------------------------------------------
create table if not exists public.project_inputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  idea text not null default '',
  existing_story text not null default '',
  additional_instructions text not null default '',
  character_reference_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_inputs_project_id_idx on public.project_inputs (project_id);

-- ---------------------------------------------------------------------------
-- stories / story_versions (Phase 2+)
-- ---------------------------------------------------------------------------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  current_version_id uuid,
  title text not null default '',
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stories_project_id_idx on public.stories (project_id);

create table if not exists public.story_versions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  schema_version text not null default '1.0.0',
  screenplay jsonb not null default '{}'::jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists story_versions_story_id_idx on public.story_versions (story_id);

alter table public.stories
  drop constraint if exists stories_current_version_id_fkey;
alter table public.stories
  add constraint stories_current_version_id_fkey
  foreign key (current_version_id) references public.story_versions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- characters / reference_assets
-- ---------------------------------------------------------------------------
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  visual_identity text not null default '',
  clothing text not null default '',
  appearance_details text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists characters_user_id_idx on public.characters (user_id);

create table if not exists public.project_characters (
  project_id uuid not null references public.projects (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  primary key (project_id, character_id)
);

create table if not exists public.reference_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  storage_key text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  checksum_sha256 text,
  original_filename text,
  created_at timestamptz not null default now()
);

create index if not exists reference_assets_user_id_idx on public.reference_assets (user_id);
create index if not exists reference_assets_character_id_idx on public.reference_assets (character_id);
create index if not exists reference_assets_project_id_idx on public.reference_assets (project_id);

-- ---------------------------------------------------------------------------
-- scenes / generation / assets
-- ---------------------------------------------------------------------------
create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  scene_number int not null check (scene_number between 1 and 5),
  title text not null default '',
  state public.scene_state not null default 'PENDING',
  duration_seconds numeric(6,2) not null default 6,
  flow_prompt text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, scene_number)
);

create index if not exists scenes_project_id_idx on public.scenes (project_id);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  scene_id uuid not null references public.scenes (id) on delete cascade,
  idempotency_key text not null unique,
  provider text not null default 'mock',
  submission_id text,
  status text not null default 'pending',
  reserved_credits int not null default 0,
  observed_credits int,
  error_message text,
  diagnostic_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_jobs_project_id_idx on public.generation_jobs (project_id);
create index if not exists generation_jobs_scene_id_idx on public.generation_jobs (scene_id);

create table if not exists public.generated_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  scene_id uuid not null references public.scenes (id) on delete cascade,
  generation_job_id uuid references public.generation_jobs (id) on delete set null,
  storage_key text not null,
  content_type text not null default 'video/mp4',
  byte_size bigint not null default 0,
  checksum_sha256 text,
  duration_seconds numeric(8,3),
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index if not exists generated_assets_scene_id_idx on public.generated_assets (scene_id);

-- ---------------------------------------------------------------------------
-- credits / workflow jobs
-- ---------------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  generation_job_id uuid references public.generation_jobs (id) on delete set null,
  entry_type text not null,
  amount int not null,
  balance_after int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_created_idx on public.credit_ledger (user_id, created_at desc);

create table if not exists public.workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  job_type text not null,
  state text not null default 'queued',
  idempotency_key text not null unique,
  lease_owner text,
  lease_expires_at timestamptz,
  attempts int not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_jobs_state_lease_idx on public.workflow_jobs (state, lease_expires_at);

-- ---------------------------------------------------------------------------
-- approvals / outputs / notifications / settings / audit
-- ---------------------------------------------------------------------------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  approval_type text not null,
  status text not null default 'pending',
  decided_by uuid references public.users (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists approvals_project_id_idx on public.approvals (project_id);

create table if not exists public.video_outputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_key text not null,
  content_type text not null default 'video/mp4',
  byte_size bigint not null default 0,
  duration_seconds numeric(8,3),
  width int,
  height int,
  quality_label text not null default 'scaled',
  checksum_sha256 text,
  created_at timestamptz not null default now()
);

create index if not exists video_outputs_project_id_idx on public.video_outputs (project_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  kind text not null,
  title text not null,
  body text not null default '',
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_project_created_idx on public.audit_logs (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists project_inputs_set_updated_at on public.project_inputs;
create trigger project_inputs_set_updated_at
before update on public.project_inputs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth profile bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, 'user'), '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.project_inputs enable row level security;
alter table public.stories enable row level security;
alter table public.story_versions enable row level security;
alter table public.characters enable row level security;
alter table public.project_characters enable row level security;
alter table public.reference_assets enable row level security;
alter table public.scenes enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generated_assets enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.workflow_jobs enable row level security;
alter table public.approvals enable row level security;
alter table public.video_outputs enable row level security;
alter table public.notifications enable row level security;
alter table public.system_settings enable row level security;
alter table public.audit_logs enable row level security;

-- users
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (auth.uid() = id);

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (auth.uid() = id);

-- projects
drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
  for select using (auth.uid() = user_id and deleted_at is null);

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update using (auth.uid() = user_id);

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects
  for delete using (auth.uid() = user_id);

-- project_inputs via project ownership
drop policy if exists project_inputs_all_own on public.project_inputs;
create policy project_inputs_all_own on public.project_inputs
  for all using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid() and p.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid() and p.deleted_at is null
    )
  );

-- characters
drop policy if exists characters_all_own on public.characters;
create policy characters_all_own on public.characters
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- project_characters
drop policy if exists project_characters_all_own on public.project_characters;
create policy project_characters_all_own on public.project_characters
  for all using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

-- reference_assets
drop policy if exists reference_assets_all_own on public.reference_assets;
create policy reference_assets_all_own on public.reference_assets
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- stories
drop policy if exists stories_all_own on public.stories;
create policy stories_all_own on public.stories
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists story_versions_all_own on public.story_versions;
create policy story_versions_all_own on public.story_versions
  for all using (
    exists (
      select 1
      from public.stories s
      join public.projects p on p.id = s.project_id
      where s.id = story_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.stories s
      join public.projects p on p.id = s.project_id
      where s.id = story_id and p.user_id = auth.uid()
    )
  );

-- scenes / jobs / assets / credits / workflow / approvals / outputs / notifications / audit
drop policy if exists scenes_all_own on public.scenes;
create policy scenes_all_own on public.scenes
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists generation_jobs_all_own on public.generation_jobs;
create policy generation_jobs_all_own on public.generation_jobs
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists generated_assets_all_own on public.generated_assets;
create policy generated_assets_all_own on public.generated_assets
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own on public.credit_ledger
  for select using (auth.uid() = user_id);

drop policy if exists workflow_jobs_all_own on public.workflow_jobs;
create policy workflow_jobs_all_own on public.workflow_jobs
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists approvals_all_own on public.approvals;
create policy approvals_all_own on public.approvals
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists video_outputs_all_own on public.video_outputs;
create policy video_outputs_all_own on public.video_outputs
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists notifications_all_own on public.notifications;
create policy notifications_all_own on public.notifications
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists system_settings_select_authenticated on public.system_settings;
create policy system_settings_select_authenticated on public.system_settings
  for select to authenticated using (true);

drop policy if exists audit_logs_select_own on public.audit_logs;
create policy audit_logs_select_own on public.audit_logs
  for select using (auth.uid() = user_id);

-- Default system settings seed
insert into public.system_settings (key, value)
values
  ('daily_flow_credit_budget', '50'::jsonb),
  ('default_scene_count', '5'::jsonb),
  ('estimated_cost_per_scene', '10'::jsonb),
  ('max_generations_per_project', '5'::jsonb),
  ('default_timezone', '"Asia/Karachi"'::jsonb)
on conflict (key) do nothing;
