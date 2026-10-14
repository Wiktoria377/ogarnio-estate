-- ETAP 4, faza 5: AI Marketing Director 2.0 („Zaproponuj mi strategię”).
-- Strategia biura zapisana razem z migawką danych, na których powstała
-- (sekcja „dane” jest liczona przez serwer, nie przez model), wersją promptu,
-- wersjami skills i kosztem procesu. Wynik zapisuje wyłącznie serwer;
-- członkowie biura czytają, zmieniają status i usuwają (wg ról).

create table public.marketing_strategies (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'accepted', 'archived')),
  -- Wybory użytkownika: cel, okres, odbiorcy, oferty, kanały, budżet, częstotliwość.
  input jsonb not null check (pg_column_size(input) <= 16384),
  -- Migawka danych z aplikacji (klucz, etykieta, wartość) użyta w strategii.
  data_snapshot jsonb not null default '[]'::jsonb check (pg_column_size(data_snapshot) <= 65536),
  -- Strategia: 11 sekcji + wnioski, hipotezy, rekomendacje (zweryfikowane).
  output jsonb not null check (pg_column_size(output) <= 262144),
  warnings jsonb not null default '[]'::jsonb,
  prompt_version text not null,
  model text not null,
  skills jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index marketing_strategies_ws_idx on public.marketing_strategies (workspace_id, created_at desc);

alter table public.marketing_strategies enable row level security;

create policy "strategies: members read" on public.marketing_strategies
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "strategies: editors decide" on public.marketing_strategies
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent', 'marketing']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent', 'marketing']));
create policy "strategies: delete" on public.marketing_strategies
  for delete to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin']) or (created_by = auth.uid() and public.is_workspace_member(workspace_id)));
-- Brak polityki insert: strategie tworzy serwer (service role) po wygenerowaniu i weryfikacji.

-- Klient może zmienić tylko status i tytuł; treść, dane i wersje są niezmienne.
create or replace function public.marketing_strategies_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.workspace_id <> old.workspace_id or new.input is distinct from old.input or new.output is distinct from old.output
       or new.data_snapshot is distinct from old.data_snapshot or new.warnings is distinct from old.warnings
       or new.prompt_version <> old.prompt_version or new.model <> old.model or new.skills is distinct from old.skills
       or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
      raise exception 'Można zmienić tylko status i tytuł strategii' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger marketing_strategies_guard before update on public.marketing_strategies
  for each row execute function public.marketing_strategies_guard();

-- Koszt per proces: każde wywołanie modelu może wskazać proces (np. jedna
-- strategia, jedno uruchomienie autopilota, jedna analiza marki) i wersję promptu.
alter table public.ai_usage_events
  add column if not exists process_type text check (process_type is null or char_length(process_type) <= 40),
  add column if not exists process_id uuid,
  add column if not exists prompt_version text check (prompt_version is null or char_length(prompt_version) <= 60);
create index if not exists ai_usage_process_idx on public.ai_usage_events (process_id) where process_id is not null;
