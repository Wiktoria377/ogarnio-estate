-- ETAP 4, faza 8: Campaign Autopilot („Przygotuj mój marketing na najbliższy miesiąc”).
-- Uruchomienie (plan + uzasadnienie + limit kosztu) i kolejka akceptacji
-- materiałów. Wszystkie zapisy wykonuje serwer po sprawdzeniu roli
-- (członkowie biura tylko czytają przez RLS). Nic nie jest publikowane ani
-- opłacane automatycznie: zaakceptowany materiał można jedynie wstawić do planera.

create table public.autopilot_runs (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'planned' check (status in ('planned', 'generating', 'ready', 'archived')),
  input jsonb not null check (pg_column_size(input) <= 16384),
  rationale jsonb not null default '[]'::jsonb check (pg_column_size(rationale) <= 32768),
  data_snapshot jsonb not null default '[]'::jsonb check (pg_column_size(data_snapshot) <= 65536),
  strategy_id uuid references public.marketing_strategies (id) on delete set null,
  ai_limit integer not null check (ai_limit between 0 and 40),
  ai_used integer not null default 0 check (ai_used >= 0),
  plan_version text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index autopilot_runs_ws_idx on public.autopilot_runs (workspace_id, created_at desc);

create table public.autopilot_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.autopilot_runs (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  position integer not null check (position between 1 and 40),
  kind text not null check (kind in ('post', 'carousel', 'promo_graphic', 'video_script', 'ad_proposal')),
  platform text not null check (platform in ('instagram', 'facebook', 'linkedin', 'tiktok')),
  pillar text not null check (char_length(pillar) <= 40),
  goal text not null check (char_length(goal) <= 40),
  property_id uuid references public.properties (id) on delete set null,
  content_type text not null check (char_length(content_type) <= 80),
  format text check (format is null or format in ('square', 'carousel', 'story')),
  planned_at timestamptz not null,
  topic text not null default '' check (char_length(topic) <= 200),
  rationale text not null check (char_length(rationale) <= 1000),
  status text not null default 'proposed' check (status in ('proposed', 'generating', 'ready', 'failed', 'accepted', 'rejected', 'scheduled')),
  content_item_id uuid references public.content_items (id) on delete set null,
  schedule_entry_id uuid references public.schedule_entries (id) on delete set null,
  generations integer not null default 0 check (generations between 0 and 10),
  error text check (error is null or char_length(error) <= 500),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, position)
);
create index autopilot_items_run_idx on public.autopilot_items (run_id, position);
create index autopilot_items_ws_idx on public.autopilot_items (workspace_id, status);

alter table public.autopilot_runs enable row level security;
alter table public.autopilot_items enable row level security;
create policy "autopilot runs: members read" on public.autopilot_runs
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "autopilot items: members read" on public.autopilot_items
  for select to authenticated using (public.is_workspace_member(workspace_id));
-- Brak polityk insert/update/delete: kolejką zarządza serwer (service role) po autoryzacji.

-- Pozycja kolejki musi należeć do tego samego biura co uruchomienie.
create or replace function public.autopilot_items_same_ws()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.autopilot_runs r where r.id = new.run_id and r.workspace_id = new.workspace_id) then
    raise exception 'Pozycja autopilota spoza biura' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger autopilot_items_same_ws before insert or update on public.autopilot_items
  for each row execute function public.autopilot_items_same_ws();

-- Zadanie w tle: przygotowanie materiału z kolejki autopilota.
alter table public.generation_jobs drop constraint if exists generation_jobs_kind_check;
alter table public.generation_jobs add constraint generation_jobs_kind_check
  check (kind in ('campaign_brief', 'campaign_asset', 'video_render', 'import_fetch', 'import_photos', 'brand_analysis', 'autopilot_item'));
