-- OGARNIO ESTATE · migration 009 · ETAP 3, faza 3: team (roles, invitations,
-- deactivation, property assignment) and the onboarding wizard.
-- Role matrix: src/core/auth/permissions.ts. Every rule below is enforced in
-- the database; the UI only mirrors it.

-- ─────────────────────────────────────────────────────────────────────────────
-- Roles: + marketing (materials, campaigns, calendar, approvals; no billing,
-- no property editing)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check
  check (role in ('owner', 'admin', 'agent', 'marketing', 'viewer'));
alter table public.workspace_members
  add column if not exists media_rights_ack_at timestamptz,
  add column if not exists invited_by uuid references auth.users (id) on delete set null;

-- Content editing policies (materials, campaigns, jobs, planner, media, templates,
-- storage files): editing roles now include marketing. Rewritten from the
-- deparsed expressions so every existing policy keeps its other conditions.
do $migration$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and tablename not in ('properties', 'property_photos')
      and (coalesce(qual, '') ~ $re$'agent'(::text)?\]$re$ or coalesce(with_check, '') ~ $re$'agent'(::text)?\]$re$)
      and coalesce(qual, '') || coalesce(with_check, '') !~ 'marketing'
  loop
    v_using := regexp_replace(p.qual, $re$'agent'(::text)?\]$re$, $re$'agent'::text, 'marketing'::text]$re$, 'g');
    v_check := regexp_replace(p.with_check, $re$'agent'(::text)?\]$re$, $re$'agent'::text, 'marketing'::text]$re$, 'g');
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if v_using is not null then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check is not null then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
  end loop;
end;
$migration$;

-- Job RPCs: marketing may retry/cancel jobs of its office too.
create or replace function public.retry_generation_job(p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.generation_jobs;
begin
  select * into v from public.generation_jobs where id = p_job for update;
  if v.id is null or not public.has_workspace_role(v.workspace_id, array['owner', 'admin', 'agent', 'marketing']) then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if v.status not in ('failed', 'canceled') then
    raise exception 'job_not_retryable' using errcode = '55000';
  end if;
  if v.manual_retries >= 5 then
    raise exception 'job_retry_limit' using errcode = '54000';
  end if;
  update public.generation_jobs
  set status = 'queued', attempts = 0, manual_retries = manual_retries + 1, run_after = now(),
      error_message = null, error_code = null, result = null, progress = 0,
      locked_at = null, locked_by = null, finished_at = null
  where id = p_job;
end;
$$;

create or replace function public.cancel_generation_job(p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.generation_jobs;
begin
  select * into v from public.generation_jobs where id = p_job for update;
  if v.id is null or not public.has_workspace_role(v.workspace_id, array['owner', 'admin', 'agent', 'marketing']) then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if v.status <> 'queued' then
    raise exception 'job_not_cancelable' using errcode = '55000';
  end if;
  update public.generation_jobs
  set status = 'canceled', finished_at = now(), error_message = 'Anulowane przez użytkownika.', error_code = 'canceled'
  where id = p_job;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Properties: owner/admin edit all; agents edit offers assigned to them or
-- created by them; marketing and viewers read only.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.can_edit_property(p_property uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.properties p
    where p.id = p_property
      and (public.has_workspace_role(p.workspace_id, array['owner', 'admin'])
           or (public.has_workspace_role(p.workspace_id, array['agent'])
               and (p.agent_id = auth.uid() or p.created_by = auth.uid())))
  );
$$;
revoke all on function public.can_edit_property(uuid) from public, anon;
grant execute on function public.can_edit_property(uuid) to authenticated, service_role;

drop policy if exists "properties: editors insert" on public.properties;
drop policy if exists "properties: editors update" on public.properties;
drop policy if exists "properties: editors delete" on public.properties;
create policy "properties: creators insert" on public.properties for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']) and created_by = auth.uid()
              -- agents may only assign new offers to themselves (or leave unassigned)
              and (agent_id is null or agent_id = auth.uid() or public.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy "properties: editors update" on public.properties for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin'])
         or (public.has_workspace_role(workspace_id, array['agent']) and (agent_id = auth.uid() or created_by = auth.uid())))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin'])
         or (public.has_workspace_role(workspace_id, array['agent']) and (agent_id = auth.uid() or (agent_id is null and created_by = auth.uid()))));
create policy "properties: editors delete" on public.properties for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin'])
         or (public.has_workspace_role(workspace_id, array['agent']) and (agent_id = auth.uid() or created_by = auth.uid())));

drop policy if exists "photos: editors insert" on public.property_photos;
drop policy if exists "photos: editors update" on public.property_photos;
drop policy if exists "photos: editors delete" on public.property_photos;
create policy "photos: editors insert" on public.property_photos for insert to authenticated
  with check (public.can_edit_property(property_id) and created_by = auth.uid());
create policy "photos: editors update" on public.property_photos for update to authenticated
  using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
create policy "photos: editors delete" on public.property_photos for delete to authenticated
  using (public.can_edit_property(property_id));

-- Assigned agent must be an ACTIVE agent/admin/owner of the office.
create or replace function public.check_property_agent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.agent_id is not null and not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = new.workspace_id and m.user_id = new.agent_id and m.status = 'active'
      and m.role in ('owner', 'admin', 'agent')
  ) then
    raise exception 'agent_not_in_workspace' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function public.check_property_agent() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Invitations (e-mail + single-use token; only the token hash is stored)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  role text not null check (role in ('admin', 'agent', 'marketing', 'viewer')),
  token_hash text not null unique check (char_length(token_hash) = 64),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  last_sent_at timestamptz not null default now()
);
create unique index workspace_invitations_open_idx on public.workspace_invitations (workspace_id, email)
  where accepted_at is null and revoked_at is null;
alter table public.workspace_invitations enable row level security;
create policy "invitations: owner read" on public.workspace_invitations for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner']));
grant select on public.workspace_invitations to authenticated;
grant select, insert, update, delete on public.workspace_invitations to service_role;
grant select, insert, update on public.workspace_members to service_role;

-- Seats: members + open invitations may not exceed the plan.
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  -- Only new seats count: a new open invitation, a new member or a reactivation.
  if tg_table_name = 'workspace_members' then
    if tg_op = 'UPDATE' and not (old.status = 'deactivated' and new.status = 'active') then
      return new;
    end if;
    if tg_op = 'INSERT' and new.status <> 'active' then
      return new;
    end if;
    -- The very first member (creator) is always allowed.
    if not exists (select 1 from public.workspace_members where workspace_id = new.workspace_id) then
      return new;
    end if;
    -- Accepting an open invitation converts a seat that was already counted.
    if current_setting('oe.accepting_invitation', true) = new.workspace_id::text then
      return new;
    end if;
  end if;
  select l.max_users into v_limit from public.workspace_limits(new.workspace_id) l;
  if v_limit is not null and public.seats_used(new.workspace_id) >= v_limit then
    raise exception 'plan_limit:max_users:%', v_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_seat_limit() from public, anon, authenticated;
create trigger workspace_invitations_seat_limit before insert on public.workspace_invitations
  for each row execute function public.enforce_seat_limit();
create trigger workspace_members_seat_limit before insert or update of status on public.workspace_members
  for each row execute function public.enforce_seat_limit();

/*
 * Accepts an invitation for the signed-in user. The token is single use, must
 * not be expired or revoked, and the account e-mail must match the invited one.
 */
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v public.workspace_invitations;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v from public.workspace_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;
  if v.id is null or v.revoked_at is not null then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;
  if v.accepted_at is not null then
    raise exception 'invitation_used' using errcode = 'P0001';
  end if;
  if v.expires_at < now() then
    raise exception 'invitation_expired' using errcode = 'P0001';
  end if;
  if v.email <> v_email then
    raise exception 'invitation_email_mismatch' using errcode = 'P0001';
  end if;
  update public.workspace_invitations set accepted_at = now(), accepted_by = v_uid where id = v.id;
  perform set_config('oe.accepting_invitation', v.workspace_id::text, true);
  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (v.workspace_id, v_uid, v.role, v.invited_by)
  on conflict (workspace_id, user_id) do update
    set role = excluded.role, status = 'active', deactivated_at = null, deactivated_by = null;
  perform set_config('oe.accepting_invitation', '', true);
  return v.workspace_id;
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- Last-owner protection: an office always keeps at least one active owner.
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active')
     and not exists (select 1 from public.workspace_members m
                     where m.workspace_id = old.workspace_id and m.user_id <> old.user_id
                       and m.role = 'owner' and m.status = 'active')
     -- the whole office is being deleted (cascade): allowed
     and exists (select 1 from public.workspaces w where w.id = old.workspace_id) then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.protect_last_owner() from public, anon, authenticated;
create trigger workspace_members_last_owner before update or delete on public.workspace_members
  for each row execute function public.protect_last_owner();

-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding wizard progress (pausable, resumable)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.workspaces
  add column if not exists onboarding jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_completed_at timestamptz;

-- Existing offices (created before the wizard) are not forced through it.
update public.workspaces set onboarding_completed_at = coalesce(onboarding_completed_at, now()) where created_at < now();

-- Members record their own media-rights acknowledgement (uploads require it).
create or replace function public.acknowledge_media_rights(p_ws uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.workspace_members set media_rights_ack_at = coalesce(media_rights_ack_at, now())
  where workspace_id = p_ws and user_id = auth.uid() and status = 'active';
$$;
revoke all on function public.acknowledge_media_rights(uuid) from public, anon;
grant execute on function public.acknowledge_media_rights(uuid) to authenticated;
