-- OGARNIO ESTATE · etap 4 · Brand Intelligence
-- Profil marki z 10 elementami, wersje (szkic → zatwierdzony → zastąpiony),
-- przywracanie, analiza strony www za zgodą i materiały referencyjne.

-- Rozszerzone elementy profilu (słowa, CTA, odbiorcy, wytyczne, style, warianty logo).
alter table public.brand_profiles add column extended jsonb not null default '{}'::jsonb
  check (jsonb_typeof(extended) = 'object' and pg_column_size(extended) <= 65536);
alter table public.brand_profiles add column approved_version integer;

create table public.brand_profile_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'approved', 'superseded', 'discarded')),
  source text not null check (source in ('initial', 'manual', 'analysis', 'restore')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 131072),
  confidence jsonb not null default '{}'::jsonb check (jsonb_typeof(confidence) = 'object'),
  analysis_id uuid,
  restored_from integer,
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  unique (workspace_id, version),
  unique (id, workspace_id)
);
create index brand_profile_versions_ws_idx on public.brand_profile_versions (workspace_id, version desc);
-- Najwyżej jeden obowiązujący profil na biuro.
create unique index brand_profile_versions_one_approved on public.brand_profile_versions (workspace_id) where status = 'approved';

create table public.brand_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  url text not null check (char_length(url) between 8 and 500),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  consent_text text not null check (char_length(consent_text) between 20 and 1000),
  consent_version text not null check (char_length(consent_version) <= 40),
  consented_by uuid not null references auth.users (id) on delete cascade,
  consented_at timestamptz not null default now(),
  use_references boolean not null default true,
  job_id uuid,
  pages jsonb not null default '[]'::jsonb,
  result jsonb,
  version_id uuid,
  error_code text check (char_length(error_code) <= 60),
  error_message text check (char_length(error_message) <= 500),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (id, workspace_id)
);
create index brand_analyses_ws_idx on public.brand_analyses (workspace_id, created_at desc);

alter table public.brand_profile_versions
  add constraint brand_profile_versions_analysis_fk foreign key (analysis_id, workspace_id)
  references public.brand_analyses (id, workspace_id) on delete set null (analysis_id);
alter table public.brand_analyses
  add constraint brand_analyses_version_fk foreign key (version_id, workspace_id)
  references public.brand_profile_versions (id, workspace_id) on delete set null (version_id);

-- Materiały referencyjne poza obrazami (obrazy są w brand_assets): PDF, przykładowe posty, opis firmy.
create table public.brand_references (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('pdf', 'post', 'description')),
  title text not null check (char_length(title) between 1 and 160),
  storage_path text unique,
  mime_type text check (mime_type is null or mime_type = 'application/pdf'),
  size_bytes integer not null default 0 check (size_bytes >= 0 and size_bytes <= 15728640),
  pages integer check (pages >= 0),
  text_content text not null default '' check (char_length(text_content) <= 60000),
  extraction_note text check (char_length(extraction_note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'pdf') = (storage_path is not null))
);
create index brand_references_ws_idx on public.brand_references (workspace_id, created_at desc);
create trigger brand_references_storage_limit before insert on public.brand_references
  for each row execute function public.enforce_storage_limit();

create or replace function public.storage_used_bytes(p_ws uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(size_bytes) from public.property_photos where workspace_id = p_ws), 0)
       + coalesce((select sum(size_bytes) from public.brand_assets where workspace_id = p_ws), 0)
       + coalesce((select sum(size_bytes) from public.rendered_files where workspace_id = p_ws), 0)
       + coalesce((select sum(size_bytes) from public.media_assets where workspace_id = p_ws), 0)
       + coalesce((select sum(size_bytes) from public.publication_files where workspace_id = p_ws), 0)
       + coalesce((select sum(size_bytes) from public.brand_references where workspace_id = p_ws), 0);
$$;

alter table public.brand_profile_versions enable row level security;
alter table public.brand_analyses enable row level security;
alter table public.brand_references enable row level security;

create policy "brand versions: members read" on public.brand_profile_versions
  for select to authenticated using (public.is_workspace_member(workspace_id));
-- Szkic można edytować lub odrzucić; zatwierdzenie tylko przez approve_brand_version().
create policy "brand versions: owner/admin edit drafts" on public.brand_profile_versions
  for update to authenticated
  using (status = 'draft' and public.has_workspace_role(workspace_id, array['owner', 'admin']))
  with check (status in ('draft', 'discarded') and public.has_workspace_role(workspace_id, array['owner', 'admin']));

create policy "brand analyses: members read" on public.brand_analyses
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "brand analyses: owner/admin start with consent" on public.brand_analyses
  for insert to authenticated
  with check (
    public.has_workspace_role(workspace_id, array['owner', 'admin'])
    and consented_by = auth.uid() and status = 'queued' and result is null and version_id is null
  );

create policy "brand references: members read" on public.brand_references
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "brand references: owner/admin insert" on public.brand_references
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin']) and created_by = auth.uid());
create policy "brand references: owner/admin delete" on public.brand_references
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

revoke insert, delete on public.brand_profile_versions from anon, authenticated;
revoke update, delete on public.brand_analyses from anon, authenticated;
revoke update on public.brand_references from anon, authenticated;

-- Zadanie w tle: analiza strony www marki.
alter table public.generation_jobs drop constraint if exists generation_jobs_kind_check;
alter table public.generation_jobs add constraint generation_jobs_kind_check
  check (kind in ('campaign_brief', 'campaign_asset', 'video_render', 'import_fetch', 'import_photos', 'brand_analysis'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Migawka obowiązującego profilu (pola edytowalne, bez metadanych).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.brand_profile_snapshot(p_ws uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(b) - 'workspace_id' - 'updated_by' - 'updated_at' - 'approved_version'
  from public.brand_profiles b where b.workspace_id = p_ws;
$$;

-- Zapisuje bieżący profil jako nową zatwierdzoną wersję (np. po ręcznej edycji w Brand Studio).
create or replace function public.record_brand_version(p_ws uuid, p_source text, p_note text default null, p_restored_from integer default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  if not public.has_workspace_role(p_ws, array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_source not in ('initial', 'manual', 'restore') then
    raise exception 'bad_source' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('brand_version:' || p_ws::text, 0));
  select coalesce(max(version), 0) + 1 into v_next from public.brand_profile_versions where workspace_id = p_ws;
  update public.brand_profile_versions set status = 'superseded' where workspace_id = p_ws and status = 'approved';
  insert into public.brand_profile_versions (workspace_id, version, status, source, snapshot, note, restored_from, created_by, decided_by, decided_at)
  values (p_ws, v_next, 'approved', p_source, public.brand_profile_snapshot(p_ws), left(p_note, 300), p_restored_from, auth.uid(), auth.uid(), now());
  update public.brand_profiles set approved_version = v_next where workspace_id = p_ws;
  return v_next;
end;
$$;

-- Zatwierdza szkic: przepisuje migawkę do obowiązującego profilu. Ograniczenia
-- kolumn brand_profiles (CHECK, FK logo) chronią przed nieprawidłowymi danymi.
create or replace function public.approve_brand_version(p_version uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.brand_profile_versions;
  s jsonb;
begin
  select * into v from public.brand_profile_versions where id = p_version for update;
  if v.id is null or not public.has_workspace_role(v.workspace_id, array['owner', 'admin']) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v.status <> 'draft' then
    raise exception 'not_draft' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('brand_version:' || v.workspace_id::text, 0));
  s := v.snapshot;
  update public.brand_profiles set
    company_name = coalesce(s->>'company_name', company_name),
    tagline = case when s ? 'tagline' then s->>'tagline' else tagline end,
    logo_asset_id = case when s ? 'logo_asset_id' then (s->>'logo_asset_id')::uuid else logo_asset_id end,
    colors = coalesce(s->'colors', colors),
    heading_font = coalesce(s->>'heading_font', heading_font),
    body_font = coalesce(s->>'body_font', body_font),
    contact_email = case when s ? 'contact_email' then s->>'contact_email' else contact_email end,
    contact_phone = case when s ? 'contact_phone' then s->>'contact_phone' else contact_phone end,
    address = case when s ? 'address' then s->>'address' else address end,
    website = case when s ? 'website' then s->>'website' else website end,
    socials = coalesce(s->'socials', socials),
    brand_style = coalesce(s->>'brand_style', brand_style),
    personality = case when s ? 'personality' then s->>'personality' else personality end,
    target_audience = case when s ? 'target_audience' then s->>'target_audience' else target_audience end,
    communication_style = coalesce(s->>'communication_style', communication_style),
    address_form = coalesce(s->>'address_form', address_form),
    emoji_policy = coalesce(s->>'emoji_policy', emoji_policy),
    preferred_phrases = case when s ? 'preferred_phrases' then s->>'preferred_phrases' else preferred_phrases end,
    avoided_phrases = case when s ? 'avoided_phrases' then s->>'avoided_phrases' else avoided_phrases end,
    extended = coalesce(s->'extended', extended),
    approved_version = v.version,
    updated_by = auth.uid()
  where workspace_id = v.workspace_id;
  update public.brand_profile_versions set status = 'superseded' where workspace_id = v.workspace_id and status = 'approved';
  -- Zapisana migawka = dokładnie to, co obowiązuje po zatwierdzeniu.
  update public.brand_profile_versions
    set status = 'approved', decided_by = auth.uid(), decided_at = now(), snapshot = public.brand_profile_snapshot(v.workspace_id)
    where id = v.id;
  return v.version;
end;
$$;

-- Tworzy szkic (z analizy lub do przywrócenia). Wywoływane z serwera (worker lub akcja po autoryzacji).
create or replace function public.create_brand_draft(p_ws uuid, p_source text, p_snapshot jsonb, p_confidence jsonb, p_analysis uuid, p_note text, p_author uuid, p_restored_from integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next integer;
  v_id uuid;
begin
  if p_source not in ('analysis', 'restore') then
    raise exception 'bad_source' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('brand_version:' || p_ws::text, 0));
  select coalesce(max(version), 0) + 1 into v_next from public.brand_profile_versions where workspace_id = p_ws;
  insert into public.brand_profile_versions (workspace_id, version, status, source, snapshot, confidence, analysis_id, note, restored_from, created_by)
  values (p_ws, v_next, 'draft', p_source, p_snapshot, coalesce(p_confidence, '{}'::jsonb), p_analysis, left(p_note, 300), p_restored_from, p_author)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.brand_profile_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.create_brand_draft(uuid, text, jsonb, jsonb, uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.record_brand_version(uuid, text, text, integer) from public, anon;
revoke all on function public.approve_brand_version(uuid) from public, anon;
grant execute on function public.record_brand_version(uuid, text, text, integer) to authenticated;
grant execute on function public.approve_brand_version(uuid) to authenticated;

-- Istniejące biura: obecny profil jako wersja 1 (początkowa).
insert into public.brand_profile_versions (workspace_id, version, status, source, snapshot, note, decided_at)
select b.workspace_id, 1, 'approved', 'initial', public.brand_profile_snapshot(b.workspace_id), 'Stan profilu przed etapem 4', now()
from public.brand_profiles b
where not exists (select 1 from public.brand_profile_versions v where v.workspace_id = b.workspace_id);
update public.brand_profiles set approved_version = 1 where approved_version is null;

-- Nowe biura: profil startowy jako wersja 1.
create or replace function public.brand_profile_initial_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.brand_profile_versions (workspace_id, version, status, source, snapshot, note, decided_at)
  values (new.workspace_id, 1, 'approved', 'initial', to_jsonb(new) - 'workspace_id' - 'updated_by' - 'updated_at' - 'approved_version', 'Profil startowy', now())
  on conflict (workspace_id, version) do nothing;
  update public.brand_profiles set approved_version = 1 where workspace_id = new.workspace_id and approved_version is null;
  return null;
end;
$$;
revoke all on function public.brand_profile_initial_version() from public, anon, authenticated;
create trigger brand_profiles_initial_version after insert on public.brand_profiles
  for each row execute function public.brand_profile_initial_version();
