-- OGARNIO ESTATE · migration 001 · Core multi-tenant model
-- Workspaces (biura), members with roles, profiles, subscriptions (billing-ready).
-- Every tenant table carries workspace_id and is protected by RLS.

-- ─────────────────────────────────────────────────────────────────────────────
-- Utilities
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Profiles (1:1 with auth.users)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  locale text not null default 'pl' check (locale in ('pl', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Workspaces (one per real-estate office / tenant)
-- industry is kept generic so the same engine can serve other verticals later.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  industry text not null default 'real_estate' check (industry in ('real_estate')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'agent', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members (user_id);

-- Billing-ready: one subscription row per workspace. Written only by the server
-- (service role / future payment-provider webhooks), readable by members.
create table public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  plan text not null default 'starter' check (plan in ('starter', 'pro', 'agency')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  monthly_generation_limit integer not null default 300 check (monthly_generation_limit >= 0),
  provider text check (provider in ('stripe', 'przelewy24', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create trigger workspace_subscriptions_updated_at before update on public.workspace_subscriptions
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Access helpers (SECURITY DEFINER avoids recursive RLS on workspace_members)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
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
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role = any (roles)
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.has_workspace_role(uuid, text[]) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_subscriptions enable row level security;

create policy "profiles: read own and co-members" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.workspace_members a
      join public.workspace_members b on a.workspace_id = b.workspace_id
      where a.user_id = auth.uid() and b.user_id = profiles.id
    )
  );

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "workspaces: members read" on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

create policy "workspaces: owner/admin update" on public.workspaces
  for update to authenticated
  using (public.has_workspace_role(id, array['owner', 'admin']))
  with check (public.has_workspace_role(id, array['owner', 'admin']));

create policy "workspaces: owner delete" on public.workspaces
  for delete to authenticated
  using (public.has_workspace_role(id, array['owner']));

-- Workspaces are created only through create_workspace() (no insert policy).

create policy "members: members read" on public.workspace_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Member management (invites, role changes) arrives in a later stage; until
-- then members can only be written by create_workspace() and the service role.

create policy "subscriptions: members read" on public.workspace_subscriptions
  for select to authenticated
  using (public.is_workspace_member(workspace_id));
