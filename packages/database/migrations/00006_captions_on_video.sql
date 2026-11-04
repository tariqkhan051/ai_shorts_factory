-- Optional burned-in captions on the final assembled short.
alter table public.projects
  add column if not exists captions_on_video boolean not null default false;

comment on column public.projects.captions_on_video is
  'When true, ChatGPT must provide per-scene text_overlay captions and assembly burns them into the final MP4.';
