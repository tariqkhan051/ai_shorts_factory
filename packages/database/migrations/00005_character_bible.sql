-- Character bible: rich identity fields, library flag, version history, reference metadata.

alter table public.stories
  add column if not exists characters_reviewed_at timestamptz;

alter table public.characters
  add column if not exists visual_identity_structured jsonb not null default '{}'::jsonb,
  add column if not exists screenplay_character_id text,
  add column if not exists role text not null default '',
  add column if not exists age_range text not null default '',
  add column if not exists continuity_rules text not null default '',
  add column if not exists reference_image_prompt text not null default '',
  add column if not exists voice_description text not null default '',
  add column if not exists dialogue_style text not null default '',
  add column if not exists in_library boolean not null default false,
  add column if not exists primary_reference_asset_id uuid;

create index if not exists characters_in_library_idx
  on public.characters (user_id, in_library)
  where in_library = true;

create index if not exists characters_screenplay_character_id_idx
  on public.characters (user_id, screenplay_character_id);

create table if not exists public.character_versions (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  version_number int not null check (version_number > 0),
  name text not null,
  description text not null default '',
  visual_identity text not null default '',
  visual_identity_structured jsonb not null default '{}'::jsonb,
  clothing text not null default '',
  appearance_details text not null default '',
  role text not null default '',
  age_range text not null default '',
  continuity_rules text not null default '',
  reference_image_prompt text not null default '',
  voice_description text not null default '',
  dialogue_style text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) on delete set null,
  note text not null default '',
  unique (character_id, version_number)
);

create index if not exists character_versions_character_id_idx
  on public.character_versions (character_id);

alter table public.reference_assets
  add column if not exists is_primary boolean not null default false,
  add column if not exists notes text not null default '',
  add column if not exists removed_at timestamptz;

-- Soft FK for primary reference (avoid circular hard FK with characters).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'characters_primary_reference_asset_id_fkey'
  ) then
    alter table public.characters
      add constraint characters_primary_reference_asset_id_fkey
      foreign key (primary_reference_asset_id)
      references public.reference_assets (id)
      on delete set null;
  end if;
exception
  when others then
    -- Reference assets table may already have policies; ignore if constraint timing fails in partial apply.
    null;
end $$;

alter table public.character_versions enable row level security;

drop policy if exists character_versions_all_own on public.character_versions;
create policy character_versions_all_own on public.character_versions
  for all
  using (
    exists (
      select 1 from public.characters c
      where c.id = character_versions.character_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.characters c
      where c.id = character_versions.character_id
        and c.user_id = auth.uid()
    )
  );
