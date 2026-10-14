-- ETAP 4, faza 9: rekomendacje marketingowe. Rekomendacje są liczone na
-- bieżąco z danych biura (reguły, bez AI); tu zapisujemy tylko decyzje
-- użytkownika („Nie teraz”, „Zrobione”), zawsze w obrębie jednego biura.
create table if not exists public.recommendation_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 120),
  status text not null check (status in ('dismissed', 'done')),
  hidden_until timestamptz not null,
  reco_version text not null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  unique (workspace_id, key)
);
create index if not exists recommendation_states_ws on public.recommendation_states (workspace_id, hidden_until);

alter table public.recommendation_states enable row level security;
-- Członkowie biura czytają; zapis tylko przez serwer po sprawdzeniu roli (brak polityk zapisu).
drop policy if exists recommendation_states_read on public.recommendation_states;
create policy recommendation_states_read on public.recommendation_states for select using (public.is_workspace_member(workspace_id));
grant select on public.recommendation_states to authenticated;
