-- ETAP 3, faza 5: import ofert (CSV, feed XML/JSON, adaptery CRM) i synchronizacja zmian.
-- Wspólny model: każde źródło daje rekordy, które przechodzą to samo mapowanie,
-- walidację i wykrywanie duplikatów. Zmiany z synchronizacji czekają na decyzję
-- użytkownika (property_changes); nic nie nadpisuje oferty ani materiałów samo.

create table public.property_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('csv', 'feed_xml', 'feed_json', 'asari', 'esticrm')),
  name text not null check (char_length(name) between 1 and 120),
  -- Konfiguracja jawna (adres feedu, mapowanie pól, ścieżka rekordów). Sekrety tylko w property_source_secrets.
  config jsonb not null default '{}'::jsonb,
  -- review: każda zmiana wymaga akceptacji; skip_photos: zmiany zdjęć tylko zgłaszane.
  sync_policy text not null default 'review' check (sync_policy in ('review')),
  status text not null default 'active' check (status in ('active', 'error', 'disabled')),
  last_sync_at timestamptz,
  last_error text check (char_length(last_error) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index property_sources_one_csv on public.property_sources (workspace_id) where kind = 'csv';
create trigger property_sources_updated_at before update on public.property_sources
  for each row execute function public.set_updated_at();
alter table public.property_sources enable row level security;
create policy "sources: members read" on public.property_sources
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Dane logowania do CRM (token API, userID) – zaszyfrowane AES-GCM, bez polityk RLS.
create table public.property_source_secrets (
  source_id uuid primary key references public.property_sources (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  secret_enc text not null check (char_length(secret_enc) <= 4000),
  updated_at timestamptz not null default now()
);
alter table public.property_source_secrets enable row level security;
revoke all on public.property_source_secrets from anon, authenticated;

-- Powiązanie oferty ze źródłem: numer oferty w CRM + skrót ostatnio zaimportowanych danych.
alter table public.properties
  add column source_id uuid,
  add column external_ref text check (char_length(external_ref) <= 120),
  add column external_hash text check (char_length(external_hash) <= 128),
  add column last_synced_at timestamptz,
  add constraint properties_source_fk foreign key (source_id, workspace_id)
    references public.property_sources (id, workspace_id) on delete set null (source_id);
create unique index properties_external_ref_uq on public.properties (workspace_id, source_id, external_ref)
  where source_id is not null and external_ref is not null;

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_id uuid not null,
  kind text not null check (kind in ('csv', 'feed_xml', 'feed_json', 'asari', 'esticrm')),
  label text not null check (char_length(label) between 1 and 300),
  status text not null default 'preview' check (status in ('preview', 'importing', 'completed', 'failed', 'discarded')),
  headers text[] not null default '{}',
  mapping jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  unique (id, workspace_id),
  foreign key (source_id, workspace_id) references public.property_sources (id, workspace_id) on delete cascade
);
create index import_batches_ws_idx on public.import_batches (workspace_id, created_at desc);
alter table public.import_batches enable row level security;
create policy "batches: members read" on public.import_batches
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Wiersze w poczekalni: surowe dane, wynik mapowania, problemy, duplikat, decyzja.
create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  row_number integer not null check (row_number >= 1),
  raw jsonb not null,
  normalized jsonb,
  issues jsonb not null default '[]'::jsonb,
  external_ref text check (char_length(external_ref) <= 120),
  photo_urls text[] not null default '{}' check (cardinality(photo_urls) <= 40),
  match_property_id uuid,
  match_kind text check (match_kind in ('external_ref', 'fingerprint', 'file')),
  action text not null default 'create' check (action in ('create', 'update', 'skip', 'invalid', 'unchanged')),
  selected boolean not null default true,
  result text check (result in ('created', 'updated', 'skipped', 'failed', 'change_pending')),
  result_message text check (char_length(result_message) <= 1000),
  property_id uuid,
  unique (batch_id, row_number),
  foreign key (batch_id, workspace_id) references public.import_batches (id, workspace_id) on delete cascade
);
alter table public.import_rows enable row level security;
create policy "import rows: members read" on public.import_rows
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Wykryte zmiany ofert ze źródła. Stosowane wyłącznie po decyzji użytkownika.
create table public.property_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  property_id uuid not null,
  source_id uuid,
  batch_id uuid,
  changes jsonb not null check (jsonb_typeof(changes) = 'array'),
  incoming jsonb not null,
  incoming_hash text not null check (char_length(incoming_hash) <= 128),
  photo_urls text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed', 'superseded')),
  price_changed boolean not null default false,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (property_id, workspace_id) references public.properties (id, workspace_id) on delete cascade,
  foreign key (source_id, workspace_id) references public.property_sources (id, workspace_id) on delete set null (source_id),
  foreign key (batch_id, workspace_id) references public.import_batches (id, workspace_id) on delete set null (batch_id)
);
create unique index property_changes_one_pending on public.property_changes (property_id) where status = 'pending';
create index property_changes_ws_idx on public.property_changes (workspace_id, status, created_at desc);
alter table public.property_changes enable row level security;
create policy "changes: members read" on public.property_changes
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Zdjęcia z feedu/CRM: pobierane w tle (bezpieczny fetch), źródłowy URL zapamiętany,
-- żeby synchronizacja wykrywała zmiany zdjęć bez ponownego pobierania.
alter table public.property_photos add column source_url text check (char_length(source_url) <= 2000);

-- Zadania w tle: pobranie feedu/CRM do poczekalni importu oraz zdjęć zaimportowanych ofert.
alter table public.generation_jobs drop constraint if exists generation_jobs_kind_check;
alter table public.generation_jobs add constraint generation_jobs_kind_check
  check (kind in ('campaign_brief', 'campaign_asset', 'video_render', 'import_fetch', 'import_photos'));

-- Materiały powstałe przed zmianą ceny: znacznik nieaktualności (ustawiany po akceptacji zmiany).
alter table public.content_items add column stale_reason text check (char_length(stale_reason) <= 500);
alter table public.content_items add column stale_since timestamptz;

revoke insert, update, delete on public.property_sources, public.import_batches, public.import_rows, public.property_changes from anon, authenticated;

-- Nowa wersja materiału (edycja po zmianie ceny) zdejmuje znacznik nieaktualności.
create or replace function public.clear_content_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.content_items set stale_reason = null, stale_since = null
  where id = new.item_id and stale_reason is not null;
  return new;
end;
$$;
revoke all on function public.clear_content_stale() from public, anon, authenticated;
create trigger content_versions_clear_stale after insert on public.content_versions
  for each row execute function public.clear_content_stale();
