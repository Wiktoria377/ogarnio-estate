-- OGARNIO ESTATE · migration 003 · Real-estate vertical: property records and photos.
-- Facts live here and are the single source of truth for every generated material.

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  property_type text not null
    check (property_type in ('apartment', 'house', 'plot', 'commercial', 'office', 'premises', 'garage', 'room', 'other')),
  market text check (market in ('primary', 'secondary')),
  transaction_type text not null default 'sale' check (transaction_type in ('sale', 'rent')),
  city text check (char_length(city) <= 80),
  district text check (char_length(district) <= 80),
  street text check (char_length(street) <= 120),
  show_street boolean not null default false,
  area_m2 numeric(10, 2) check (area_m2 > 0 and area_m2 < 1000000),
  rooms smallint check (rooms between 0 and 50),
  floor smallint check (floor between -5 and 200),
  total_floors smallint check (total_floors between 0 and 200),
  year_built smallint check (year_built between 1500 and 2100),
  price numeric(14, 2) check (price >= 0),
  currency text not null default 'PLN' check (currency in ('PLN', 'EUR', 'USD')),
  price_per_m2 numeric(14, 2) generated always as (
    case when area_m2 > 0 and price is not null then round(price / area_m2, 2) end
  ) stored,
  description text check (char_length(description) <= 8000),
  features text[] not null default '{}' check (cardinality(features) <= 40),
  amenities text[] not null default '{}' check (cardinality(amenities) <= 40),
  agent_id uuid references auth.users (id) on delete set null,
  status text not null default 'active'
    check (status in ('draft', 'active', 'reserved', 'sold', 'rented', 'archived')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create index properties_ws_idx on public.properties (workspace_id, updated_at desc);

create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();

-- The assigned agent must belong to the same workspace.
create or replace function public.check_property_agent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.agent_id is not null and not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = new.workspace_id and m.user_id = new.agent_id
  ) then
    raise exception 'agent_not_in_workspace' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger properties_agent_check before insert or update of agent_id, workspace_id on public.properties
  for each row execute function public.check_property_agent();

create table public.property_photos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  property_id uuid not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  position integer not null default 0,
  caption text check (char_length(caption) <= 200),
  -- Marks AI-generated or edited "wizualizacja poglądowa"; graphics using it get a visible label.
  is_visualization boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (property_id, workspace_id) references public.properties (id, workspace_id) on delete cascade,
  unique (id, workspace_id)
);

create index property_photos_order_idx on public.property_photos (property_id, position);

alter table public.properties enable row level security;
alter table public.property_photos enable row level security;

create policy "properties: members read" on public.properties
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "properties: editors insert" on public.properties
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']) and created_by = auth.uid());
create policy "properties: editors update" on public.properties
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));
create policy "properties: editors delete" on public.properties
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));

create policy "photos: members read" on public.property_photos
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "photos: editors insert" on public.property_photos
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']) and created_by = auth.uid());
create policy "photos: editors update" on public.property_photos
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));
create policy "photos: editors delete" on public.property_photos
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));

-- Reorders photos atomically; ids not belonging to the property are ignored.
create or replace function public.reorder_property_photos(p_property uuid, p_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.property_photos p
  set position = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where p.id = o.id and p.property_id = p_property;
end;
$$;

revoke all on function public.reorder_property_photos(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_property_photos(uuid, uuid[]) to authenticated;
