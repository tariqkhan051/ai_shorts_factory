-- Phase 7 — RLS hardening + notification schema reconciliation

-- ---------------------------------------------------------------------------
-- Notifications: align 00001 (kind) and 00002 (type) shapes
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'kind'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'type'
  ) then
    alter table public.notifications rename column kind to type;
  end if;
end $$;

alter table public.notifications
  add column if not exists href text;

alter table public.notifications
  add column if not exists read_at timestamptz;

-- Prefer typed policies over FOR ALL for notifications
drop policy if exists notifications_all_own on public.notifications;
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_insert_own on public.notifications;

create policy notifications_select_own on public.notifications
  for select using (auth.uid() = user_id);
create policy notifications_update_own on public.notifications
  for update using (auth.uid() = user_id);
create policy notifications_insert_own on public.notifications
  for insert with check (auth.uid() = user_id);
-- Deletes are service-role / retention jobs only (no user DELETE policy).

-- ---------------------------------------------------------------------------
-- Audit logs: allow owners to insert their own rows (user JWT path)
-- ---------------------------------------------------------------------------
drop policy if exists audit_logs_insert_own on public.audit_logs;
create policy audit_logs_insert_own on public.audit_logs
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Workflow / generation jobs: owners may SELECT + INSERT, not mutate leases
-- Worker claim/complete/fail must use the service role (bypasses RLS).
-- ---------------------------------------------------------------------------
drop policy if exists workflow_jobs_all_own on public.workflow_jobs;
drop policy if exists workflow_jobs_select_own on public.workflow_jobs;
drop policy if exists workflow_jobs_insert_own on public.workflow_jobs;

create policy workflow_jobs_select_own on public.workflow_jobs
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

create policy workflow_jobs_insert_own on public.workflow_jobs
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists generation_jobs_all_own on public.generation_jobs;
drop policy if exists generation_jobs_select_own on public.generation_jobs;
drop policy if exists generation_jobs_insert_own on public.generation_jobs;

create policy generation_jobs_select_own on public.generation_jobs
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

create policy generation_jobs_insert_own on public.generation_jobs
  for insert with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Credit ledger: append-only for service role; users remain SELECT-only
-- ---------------------------------------------------------------------------
-- (no user INSERT/UPDATE/DELETE policies — intentional)

comment on table public.workflow_jobs is
  'Queue rows. User JWT: select/insert only. Lease mutations require service role.';
comment on table public.generation_jobs is
  'Generation attempts. User JWT: select/insert only. Status updates require service role.';
comment on table public.credit_ledger is
  'Immutable credit ledger. User JWT: select only. Writes require service role.';
