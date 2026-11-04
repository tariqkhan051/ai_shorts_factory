-- Phase 7 live Flow canary: extend scene_state for submission/download/verify failures.
-- PostgreSQL requires ALTER TYPE ... ADD VALUE outside of a transaction block in some hosts;
-- apply values one-by-one with IF NOT EXISTS where supported.

do $$ begin
  alter type public.scene_state add value if not exists 'SUBMITTING';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$ begin
  alter type public.scene_state add value if not exists 'UNKNOWN_SUBMISSION';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$ begin
  alter type public.scene_state add value if not exists 'DOWNLOAD_FAILED';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$ begin
  alter type public.scene_state add value if not exists 'VERIFICATION_FAILED';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
