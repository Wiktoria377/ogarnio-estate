-- OGARNIO ESTATE · migration 002 · Brand system (industry-agnostic)

create table public.brand_profiles (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  company_name text not null check (char_length(company_name) between 1 and 120),
  tagline text check (char_length(tagline) <= 160),
  logo_asset_id uuid,
  colors jsonb not null default '{"primary":"#6D4AFF","secondary":"#1F1B2E","accent":"#C9B8FF","background":"#FAF9F7","text":"#211F26"}'::jsonb,
  heading_font text not null default 'playfair-display',
  body_font text not null default 'manrope',
  contact_email text check (char_length(contact_email) <= 160),
  contact_phone text check (char_length(contact_phone) <= 40),
  address text check (char_length(address) <= 240),
  website text check (char_length(website) <= 240),
  socials jsonb not null default '{}'::jsonb,
  brand_style text not null default 'modern_minimal'
    check (brand_style in ('luxury', 'modern_minimal', 'elegant_corporate', 'warm_lifestyle', 'bold_contemporary')),
  personality text check (char_length(personality) <= 1000),
  target_audience text check (char_length(target_audience) <= 1000),
  communication_style text not null default 'professional_warm'
    check (communication_style in ('professional_warm', 'expert_formal', 'friendly_direct', 'premium_restrained', 'energetic_modern')),
  address_form text not null default 'ty' check (address_form in ('ty', 'pan_pani', 'wy')),
  emoji_policy text not null default 'none' check (emoji_policy in ('none', 'sparing')),
  preferred_phrases text check (char_length(preferred_phrases) <= 1000),
  avoided_phrases text check (char_length(avoided_phrases) <= 1000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger brand_profiles_updated_at before update on public.brand_profiles
  for each row execute function public.set_updated_at();

create table public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('logo', 'reference')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  width integer,
  height integer,
  label text check (char_length(label) <= 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create index brand_assets_ws_idx on public.brand_assets (workspace_id, kind);

alter table public.brand_profiles
  add constraint brand_profiles_logo_fk
  foreign key (logo_asset_id, workspace_id) references public.brand_assets (id, workspace_id)
  on delete set null (logo_asset_id);

alter table public.brand_profiles enable row level security;
alter table public.brand_assets enable row level security;

create policy "brand: members read" on public.brand_profiles
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "brand: owner/admin update" on public.brand_profiles
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "brand assets: members read" on public.brand_assets
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "brand assets: owner/admin insert" on public.brand_assets
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']) and created_by = auth.uid());
create policy "brand assets: owner/admin delete" on public.brand_assets
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

-- ─────────────────────────────────────────────────────────────────────────────
-- Workspace bootstrap: the only way to create a tenant. Creates the workspace,
-- owner membership, default brand profile and a trial subscription atomically.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ws uuid;
  v_name text := btrim(p_name);
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'invalid_workspace_name' using errcode = '22023';
  end if;
  -- Abuse guard: a single account may own at most 5 workspaces.
  if (select count(*) from public.workspace_members where user_id = v_uid and role = 'owner') >= 5 then
    raise exception 'workspace_limit_reached' using errcode = '54000';
  end if;

  insert into public.workspaces (name, created_by) values (v_name, v_uid) returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_ws, v_uid, 'owner');
  insert into public.brand_profiles (workspace_id, company_name, updated_by) values (v_ws, v_name, v_uid);
  insert into public.workspace_subscriptions (workspace_id) values (v_ws);
  return v_ws;
end;
$$;

revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
