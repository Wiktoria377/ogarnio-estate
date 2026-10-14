-- ETAP 3 / Faza 4: połączone konta społecznościowe i automatyczna publikacja.
--
-- Zasady:
--  * Tokeny OAuth są wyłącznie po stronie serwera, zaszyfrowane (AES-256-GCM w
--    aplikacji), w tabeli bez żadnych polityk RLS dla klientów.
--  * Klient (anon/authenticated) może tylko CZYTAĆ połączenia i publikacje swojego
--    biura. Wszystkie zmiany idą przez serwer, który sprawdza uprawnienia roli.
--  * Publikacja trafia do kolejki tylko po akceptacji osoby uprawnionej, a za
--    opublikowaną uznajemy ją dopiero po potwierdzeniu z API platformy.

-- ─────────────────────────────────────────────────────────────────────────────
-- Połączone konta (strony FB, konta IG, profile/strony LinkedIn, TikTok w przyszłości)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform text not null check (platform in ('facebook_page', 'instagram', 'linkedin_org', 'linkedin_member', 'tiktok')),
  external_id text not null check (char_length(external_id) between 1 and 200),
  name text not null check (char_length(name) between 1 and 200),
  username text check (char_length(username) <= 200),
  avatar_url text check (avatar_url is null or (avatar_url like 'https://%' and char_length(avatar_url) <= 1000)),
  -- Instagram konto jest publikowane przez token powiązanej strony FB.
  parent_id uuid references public.social_connections (id) on delete set null,
  status text not null default 'connected' check (status in ('connected', 'limited', 'reauth_required', 'unavailable', 'error', 'disconnected')),
  capabilities text[] not null default '{}',
  granted_scopes text[] not null default '{}',
  missing_scopes text[] not null default '{}',
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text check (char_length(last_error) <= 1000),
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, platform, external_id),
  unique (id, workspace_id)
);
create index social_connections_ws_idx on public.social_connections (workspace_id, status);
create trigger social_connections_updated_at before update on public.social_connections
  for each row execute function public.set_updated_at();

alter table public.social_connections enable row level security;
create policy "social: members read" on public.social_connections
  for select to authenticated using (public.is_workspace_member(workspace_id));
-- Brak polityk insert/update/delete: zapis tylko przez serwer (service role).

-- Limit planu: liczba aktywnych (nie odłączonych) kont.
create or replace function public.enforce_social_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
begin
  if new.status = 'disconnected' then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'disconnected' then return new; end if;
  select l.max_social_accounts into v_limit from public.workspace_limits(new.workspace_id) l;
  select count(*) into v_used from public.social_connections
    where workspace_id = new.workspace_id and status <> 'disconnected' and id <> new.id;
  if v_limit is not null and v_used >= v_limit then
    raise exception 'plan_limit:max_social_accounts:%', v_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_social_limit() from public, anon, authenticated;
create trigger social_connections_limit before insert or update of status on public.social_connections
  for each row execute function public.enforce_social_limit();

-- Sekrety (tokeny dostępu i odświeżania). Tylko service role.
create table public.social_credentials (
  connection_id uuid primary key references public.social_connections (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  scopes text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.social_credentials enable row level security;
revoke all on public.social_credentials from anon, authenticated;

-- Stan OAuth (state + PKCE verifier), jednorazowy, ważny 10 minut. Tylko service role.
create table public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  provider text not null check (provider in ('meta', 'linkedin', 'tiktok')),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_verifier_enc text,
  redirect_uri text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.oauth_states enable row level security;
revoke all on public.oauth_states from anon, authenticated;

-- Wynik autoryzacji czekający na wybór stron/kont przez użytkownika (30 minut). Tylko service role.
create table public.oauth_grants (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta', 'linkedin', 'tiktok')),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  user_token_enc text not null,
  refresh_token_enc text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  -- Odkryte strony/konta: [{key, platform, external_id, name, username, avatar_url, token_enc?, parent_key?, capabilities, missing_scopes}]
  discovered jsonb not null default '[]',
  expires_at timestamptz not null default now() + interval '30 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.oauth_grants enable row level security;
revoke all on public.oauth_grants from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Publikacje: jedna pozycja = jeden materiał na jednym koncie o jednej godzinie
-- ─────────────────────────────────────────────────────────────────────────────
-- schedule_entries/campaigns/content_items: klucz złożony do FK; schedule_entries wymaga (id, workspace_id) unique do klucza złożonego
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'schedule_entries_id_workspace_key') then
    alter table public.schedule_entries add constraint schedule_entries_id_workspace_key unique (id, workspace_id);
  end if;
end $$;

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  connection_id uuid not null,
  schedule_entry_id uuid,
  campaign_id uuid,
  content_item_id uuid,
  content_version integer,
  format text not null check (format in ('text', 'photo', 'photo_set', 'carousel', 'video', 'reel')),
  caption text not null default '' check (char_length(caption) <= 5000),
  link_url text check (link_url is null or (link_url like 'https://%' and char_length(link_url) <= 1000)),
  -- [{source:'graphic'|'photo'|'video', ref, slide?}] wybrane przez użytkownika
  media_spec jsonb not null default '[]',
  -- [{storage_path, mime, width, height, size_bytes, duration_ms?}] przygotowane przy akceptacji
  media jsonb not null default '[]',
  scheduled_at timestamptz not null,
  state text not null default 'draft' check (state in (
    'draft', 'pending_approval', 'scheduled', 'queued', 'publishing', 'processing',
    'published', 'failed', 'action_required', 'canceled'
  )),
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  approved_hash text,
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  -- Ustawiane tuż przed wywołaniem API publikacji. Jeśli proces padnie lub
  -- odpowiedź nie dotrze, wynik jest niepewny: najpierw sprawdzamy status na platformie.
  attempt_started_at timestamptz,
  uncertain boolean not null default false,
  idempotency_key text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  external_container_id text check (char_length(external_container_id) <= 200),
  external_id text check (char_length(external_id) <= 200),
  external_url text check (external_url is null or (external_url like 'https://%' and char_length(external_url) <= 1000)),
  published_at timestamptz,
  error_code text check (char_length(error_code) <= 80),
  error_message text check (char_length(error_message) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (idempotency_key),
  foreign key (connection_id, workspace_id) references public.social_connections (id, workspace_id) on delete cascade,
  foreign key (schedule_entry_id, workspace_id) references public.schedule_entries (id, workspace_id) on delete set null (schedule_entry_id),
  foreign key (campaign_id, workspace_id) references public.campaigns (id, workspace_id) on delete set null (campaign_id),
  foreign key (content_item_id, workspace_id) references public.content_items (id, workspace_id) on delete set null (content_item_id),
  -- Do kolejki tylko z akceptacją.
  check (state in ('draft', 'pending_approval', 'canceled') or approved_at is not null),
  -- Opublikowana tylko z identyfikatorem z platformy.
  check (state <> 'published' or external_id is not null)
);
create index publications_ws_time_idx on public.publications (workspace_id, scheduled_at);
create index publications_due_idx on public.publications (scheduled_at) where state = 'scheduled';
create index publications_retry_idx on public.publications (next_attempt_at) where state in ('queued', 'processing');
create index publications_entry_idx on public.publications (schedule_entry_id);
create trigger publications_updated_at before update on public.publications
  for each row execute function public.set_updated_at();

alter table public.publications enable row level security;
create policy "publications: members read" on public.publications
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Dziennik prób (audyt + diagnostyka). Bez tokenów i bez pełnych odpowiedzi.
create table public.publication_attempts (
  id bigint generated always as identity primary key,
  publication_id uuid not null references public.publications (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  attempt integer not null,
  action text not null check (action in ('publish', 'check_status', 'verify_uncertain', 'cancel', 'approve', 'request', 'prepare')),
  outcome text not null check (outcome in ('ok', 'processing', 'retry', 'failed', 'action_required', 'uncertain', 'found', 'not_found')),
  error_code text,
  message text check (char_length(message) <= 1000),
  actor uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index publication_attempts_pub_idx on public.publication_attempts (publication_id, created_at);
alter table public.publication_attempts enable row level security;
create policy "publication attempts: members read" on public.publication_attempts
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Kolejka: atomowe pobranie publikacji do wykonania (SKIP LOCKED)
-- ─────────────────────────────────────────────────────────────────────────────
-- Zwraca publikacje:
--  * 'scheduled' z nadejściem terminu (przechodzą do 'queued' → wykonawca publikuje),
--  * 'queued' / 'processing' z nadejściem next_attempt_at (ponowienie / sprawdzenie statusu),
--  * 'publishing' z przeterminowaną blokadą (proces padł w trakcie: wynik niepewny).
create or replace function public.claim_publications(p_worker text, p_limit integer default 5, p_stale_seconds integer default 600)
returns setof public.publications
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select p.id from public.publications p
    where (
      (p.state = 'scheduled' and p.scheduled_at <= now())
      or (p.state in ('queued', 'processing') and coalesce(p.next_attempt_at, p.scheduled_at) <= now() and (p.locked_at is null or p.locked_at < now() - make_interval(secs => p_stale_seconds)))
      or (p.state = 'publishing' and p.locked_at < now() - make_interval(secs => p_stale_seconds))
    )
    order by p.scheduled_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  update public.publications p
     set state = case when p.state = 'scheduled' then 'queued'
                      when p.state = 'publishing' then 'queued' else p.state end,
         uncertain = p.uncertain or p.state = 'publishing',
         locked_at = now(),
         locked_by = p_worker
    from due
   where p.id = due.id
  returning p.*;
end;
$$;
revoke all on function public.claim_publications(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_publications(text, integer, integer) to service_role;

-- Liczenie kont w limicie (nadpisuje placeholder z migracji 008).
create or replace function public.social_accounts_used(p_ws uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.social_connections where workspace_id = p_ws and status <> 'disconnected';
$$;
revoke all on function public.social_accounts_used(uuid) from public, anon, authenticated;
grant execute on function public.social_accounts_used(uuid) to service_role;

-- Pliki przygotowane do publikacji liczą się do miejsca na dysku.
create table public.publication_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  publication_id uuid not null references public.publications (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index publication_files_pub_idx on public.publication_files (publication_id);
alter table public.publication_files enable row level security;
create policy "publication files: members read" on public.publication_files
  for select to authenticated using (public.is_workspace_member(workspace_id));

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
       + coalesce((select sum(size_bytes) from public.publication_files where workspace_id = p_ws), 0);
$$;
revoke all on function public.storage_used_bytes(uuid) from public, anon, authenticated;
grant execute on function public.storage_used_bytes(uuid) to service_role;

create trigger publication_files_storage_limit before insert on public.publication_files
  for each row execute function public.enforce_storage_limit();
