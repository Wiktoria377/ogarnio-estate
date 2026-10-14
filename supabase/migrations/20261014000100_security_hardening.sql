-- OGARNIO ESTATE · migration 007 · ETAP 3, faza 1: security hardening.
-- Findings of the ETAP 3 audit (docs/ETAP3_AUDIT.md): forged usage/export rows,
-- deactivated members, central error log, DB-backed rate limits.

-- ─────────────────────────────────────────────────────────────────────────────
-- Members: deactivation (account stays, access to this office ends)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.workspace_members
  add column if not exists status text not null default 'active' check (status in ('active', 'deactivated')),
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references auth.users (id) on delete set null;

-- Every RLS policy goes through these two helpers, so a deactivated member
-- loses access to all tables and files of the office at once.
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function public.has_workspace_role(ws uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.status = 'active' and m.role = any (roles)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Usage and export history: server-only writes (finding #9)
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "usage: self insert" on public.ai_usage_events;
drop policy if exists "exports: self insert" on public.export_events;
revoke insert, update, delete on public.ai_usage_events from authenticated, anon;
revoke insert, update, delete on public.export_events from authenticated, anon;
grant select, insert on public.ai_usage_events to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger functions are not callable APIs (finding #15)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.check_property_agent() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Central error log (server-side only; no client content, no secrets)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.app_errors (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  area text not null check (char_length(area) between 1 and 60),
  code text check (char_length(code) <= 80),
  message text not null check (char_length(message) <= 1000),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index app_errors_created_idx on public.app_errors (created_at desc);
create index app_errors_area_idx on public.app_errors (area, created_at desc);
alter table public.app_errors enable row level security;
-- No policies: members never read the platform error log.
grant select, insert, delete on public.app_errors to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rate limits (fixed window counters, atomic upsert). Server calls only.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
grant select, insert, update, delete on public.rate_limits to service_role;

create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- Month boundaries in the office's time zone (Europe/Warsaw), not UTC.
create or replace function public.month_start_warsaw()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (date_trunc('month', now() at time zone 'Europe/Warsaw')) at time zone 'Europe/Warsaw';
$$;
grant execute on function public.month_start_warsaw() to authenticated, service_role;
