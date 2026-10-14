-- ETAP 4, faza 3: pamięć marki (Brand Memory).
-- Dwa poziomy: pamięć jawna (zapisana lub zatwierdzona przez użytkownika) i
-- pamięć sugerowana (wniosek z powtarzających się decyzji, do akceptacji).
-- Źródłem sugestii są ustrukturyzowane zdarzenia decyzji (brand_feedback_events),
-- nie zapis rozmów z AI. Żadnego trenowania modeli: pamięć to dane w bazie,
-- wybierane selektywnie do kontekstu marki. Pełna izolacja biur przez RLS.

alter table public.brand_profiles
  add column if not exists memory_enabled boolean not null default true,
  add column if not exists memory_updated_at timestamptz;

create table public.brand_feedback_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in (
    'content_edited', 'variant_selected', 'variant_rejected', 'content_accepted',
    'graphic_template', 'graphic_edited', 'graphic_accepted',
    'material_approved', 'material_rejected'
  )),
  subject_type text not null check (subject_type in ('content_item', 'graphic', 'campaign', 'autopilot_item', 'publication')),
  subject_id uuid,
  -- Ustrukturyzowane szczegóły: np. {"cta":{"before":"…","after":"…"},"removed":["okazja"],"headline":{"before":…,"after":…}}
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 16384),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index brand_feedback_events_ws_idx on public.brand_feedback_events (workspace_id, kind, created_at desc);

create table public.brand_memory (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  level text not null check (level in ('explicit', 'suggested')),
  status text not null default 'active' check (status in ('active', 'dismissed')),
  kind text not null check (kind in (
    'cta', 'avoid', 'headline', 'headline_style', 'tone', 'template', 'color', 'rejected', 'example_text', 'note'
  )),
  -- Treść preferencji w języku użytkownika (np. CTA, zwrot do unikania, opis stylu nagłówków).
  content text not null check (char_length(content) between 1 and 600),
  -- Dane pomocnicze: id szablonu, kolor, przykład tekstu, kanał.
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 8192),
  -- Klucz deduplikacji w obrębie biura (np. "cta:zadzwoń do nas").
  dedupe_key text not null check (char_length(dedupe_key) <= 300),
  source text not null check (source in ('manual', 'decision', 'suggestion', 'approval')),
  evidence_count integer not null default 0,
  evidence jsonb not null default '[]'::jsonb check (pg_column_size(evidence) <= 16384),
  created_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz,
  last_used_at timestamptz,
  unique (workspace_id, dedupe_key)
);
create index brand_memory_ws_idx on public.brand_memory (workspace_id, level, status);

alter table public.brand_feedback_events enable row level security;
alter table public.brand_memory enable row level security;

-- Zdarzenia: czytają członkowie biura; zapisują role edytujące materiały, tylko jako siebie.
create policy "feedback: members read" on public.brand_feedback_events
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "feedback: editors insert" on public.brand_feedback_events
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent', 'marketing']) and created_by = auth.uid());
create policy "feedback: brand admins delete" on public.brand_feedback_events
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin']));
revoke update on public.brand_feedback_events from anon, authenticated;

-- Pamięć: czytają członkowie; jawne wpisy dodają role edytujące materiały
-- (np. agent zapisuje swoją poprawkę jako preferencję); sugestie tworzy wyłącznie serwer.
create policy "memory: members read" on public.brand_memory
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "memory: editors add explicit" on public.brand_memory
  for insert to authenticated
  with check (
    level = 'explicit' and status = 'active' and created_by = auth.uid()
    and public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent', 'marketing'])
  );
-- Akceptacja/odrzucenie sugestii i edycja treści: role edytujące materiały.
create policy "memory: editors decide" on public.brand_memory
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent', 'marketing']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent', 'marketing']));
-- Usuwanie: właściciel/administrator albo autor wpisu jawnego.
create policy "memory: delete" on public.brand_memory
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']) or (created_by = auth.uid() and level = 'explicit' and public.is_workspace_member(workspace_id)));

-- Kolumny, których klient nie może zmienić przy aktualizacji (ochrona przed podmianą biura, poziomu itp.).
create or replace function public.brand_memory_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id <> old.workspace_id or new.dedupe_key <> old.dedupe_key or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'immutable_column' using errcode = '42501';
  end if;
  -- Sugestię można zmienić w jawną (akceptacja), nigdy odwrotnie.
  if old.level = 'explicit' and new.level = 'suggested' then
    raise exception 'level_downgrade' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger brand_memory_guard before update on public.brand_memory
  for each row execute function public.brand_memory_guard();

-- Przełącznik pamięci (tylko owner/admin; brand_profiles ma już politykę aktualizacji dla tych ról).
-- Czyszczenie całej pamięci biura: wpisy + zdarzenia, w jednej transakcji.
create or replace function public.clear_brand_memory(p_ws uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m bigint;
  e bigint;
begin
  if not public.has_workspace_role(p_ws, array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.brand_memory where workspace_id = p_ws;
  get diagnostics m = row_count;
  delete from public.brand_feedback_events where workspace_id = p_ws;
  get diagnostics e = row_count;
  update public.brand_profiles set memory_updated_at = now() where workspace_id = p_ws;
  return jsonb_build_object('memory', m, 'events', e);
end;
$$;
revoke all on function public.clear_brand_memory(uuid) from public, anon;
grant execute on function public.clear_brand_memory(uuid) to authenticated;

-- Retencja: zdarzenia decyzji 12 miesięcy, odrzucone sugestie 6 miesięcy.
create or replace function public.run_retention()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb := '{}'::jsonb;
  n bigint;
begin
  delete from public.leads where updated_at < now() - interval '24 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('leads', n);
  delete from public.web_events where created_at < now() - interval '13 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('web_events', n);
  delete from public.site_events where created_at < now() - interval '13 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('site_events', n);
  delete from public.contact_messages where created_at < now() - interval '12 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('contact_messages', n);
  delete from public.app_errors where created_at < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('app_errors', n);
  delete from public.publication_metrics where fetched_at < now() - interval '25 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('publication_metrics', n);
  delete from public.ai_usage_events where created_at < now() - interval '25 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('ai_usage_events', n);
  delete from public.oauth_states where expires_at < now() - interval '1 day';
  get diagnostics n = row_count; r := r || jsonb_build_object('oauth_states', n);
  delete from public.oauth_grants where expires_at < now() - interval '1 day';
  get diagnostics n = row_count; r := r || jsonb_build_object('oauth_grants', n);
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('rate_limits', n);
  update public.property_changes c set batch_id = null
    from public.import_batches b where c.batch_id = b.id and b.expires_at < now() and b.status in ('preview', 'discarded', 'failed');
  delete from public.import_batches where expires_at < now() and status in ('preview', 'discarded', 'failed');
  get diagnostics n = row_count; r := r || jsonb_build_object('import_batches', n);
  delete from public.workspace_invitations where expires_at < now() - interval '30 days' and accepted_at is null;
  get diagnostics n = row_count; r := r || jsonb_build_object('invitations', n);
  delete from public.brand_feedback_events where created_at < now() - interval '12 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('brand_feedback_events', n);
  delete from public.brand_memory where level = 'suggested' and status = 'dismissed' and updated_at < now() - interval '6 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('brand_memory_dismissed', n);
  delete from public.brand_analyses where created_at < now() - interval '24 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('brand_analyses', n);
  return r;
end;
$$;
revoke execute on function public.run_retention() from public, anon, authenticated;
