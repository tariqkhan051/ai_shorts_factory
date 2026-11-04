-- Phase 6 — in-app notifications + web push subscriptions

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

create policy notifications_select_own on public.notifications
  for select using (auth.uid() = user_id);
create policy notifications_update_own on public.notifications
  for update using (auth.uid() = user_id);
create policy notifications_insert_own on public.notifications
  for insert with check (auth.uid() = user_id);

create policy push_select_own on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy push_insert_own on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy push_update_own on public.push_subscriptions
  for update using (auth.uid() = user_id);
create policy push_delete_own on public.push_subscriptions
  for delete using (auth.uid() = user_id);
