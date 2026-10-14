-- ETAP 3, faza 6: analityka publikacji, linki śledzące, publiczne strony ofert, leady.
-- Zasada: metryki pochodzą wyłącznie z oficjalnych API (albo z naszych własnych
-- zdarzeń: kliknięcia, wyświetlenia strony, leady). Brak metryki = NULL, nigdy 0.

-- Publiczna strona oferty (włączana świadomie przez biuro).
alter table public.properties
  add column public_slug text unique check (public_slug ~ '^[a-z0-9-]{3,80}$'),
  add column public_enabled boolean not null default false;

-- Migawki metryk publikacji z API platform. metrics: {views, reach, likes, comments, shares, saves, clicks, interactions} → liczba lub null.
create table public.publication_metrics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  publication_id uuid not null,
  fetched_at timestamptz not null default now(),
  source text not null check (source in ('meta', 'linkedin', 'mock')),
  metrics jsonb not null default '{}'::jsonb,
  unavailable text[] not null default '{}',
  note text check (char_length(note) <= 500),
  foreign key (publication_id) references public.publications (id) on delete cascade
);
create index publication_metrics_pub_idx on public.publication_metrics (publication_id, fetched_at desc);
create index publication_metrics_ws_idx on public.publication_metrics (workspace_id, fetched_at desc);
alter table public.publication_metrics enable row level security;
create policy "metrics: members read" on public.publication_metrics
  for select to authenticated using (public.is_workspace_member(workspace_id));
alter table public.publications add column metrics_checked_at timestamptz;

-- Linki śledzące z UTM. Cel: publiczna strona oferty albo zewnętrzny adres https.
create table public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slug text not null unique check (slug ~ '^[A-Za-z0-9]{8,16}$'),
  label text not null check (char_length(label) between 1 and 160),
  target text not null check (target in ('offer_page', 'external')),
  target_url text check (target_url is null or (target_url like 'https://%' and char_length(target_url) <= 2000)),
  property_id uuid,
  campaign_id uuid,
  publication_id uuid references public.publications (id) on delete set null,
  channel text check (char_length(channel) <= 40),
  utm_source text not null check (char_length(utm_source) between 1 and 80),
  utm_medium text not null check (char_length(utm_medium) between 1 and 80),
  utm_campaign text not null check (char_length(utm_campaign) between 1 and 120),
  utm_content text check (char_length(utm_content) <= 120),
  archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (target = 'external' and target_url is not null or target = 'offer_page' and property_id is not null),
  foreign key (property_id, workspace_id) references public.properties (id, workspace_id) on delete cascade,
  foreign key (campaign_id, workspace_id) references public.campaigns (id, workspace_id) on delete set null (campaign_id)
);
create index tracked_links_ws_idx on public.tracked_links (workspace_id, created_at desc);
alter table public.tracked_links enable row level security;
create policy "links: members read" on public.tracked_links
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Zdarzenia własne (kliknięcia i wyświetlenia strony oferty). visitor_hash: skrót
-- z dziennie zmienną solą (bez przechowywania IP), boty oznaczane i pomijane w raportach.
create table public.web_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('click', 'page_view')),
  link_id uuid references public.tracked_links (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  visitor_hash text not null check (char_length(visitor_hash) <= 64),
  is_bot boolean not null default false,
  referrer_host text check (char_length(referrer_host) <= 200),
  created_at timestamptz not null default now()
);
create index web_events_ws_idx on public.web_events (workspace_id, created_at desc);
create index web_events_link_idx on public.web_events (link_id, created_at);
alter table public.web_events enable row level security;
create policy "events: members read" on public.web_events
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Leady z formularza na stronie oferty (z dowodem zgody RODO).
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  link_id uuid references public.tracked_links (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  channel text check (char_length(channel) <= 40),
  utm jsonb not null default '{}'::jsonb,
  name text not null check (char_length(name) between 1 and 120),
  email text check (email is null or (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or phone ~ '^[0-9 +()-]{6,30}$'),
  message text check (char_length(message) <= 2000),
  consent_contact boolean not null check (consent_contact),
  consent_text text not null check (char_length(consent_text) <= 2000),
  consent_version text not null check (char_length(consent_version) <= 40),
  consent_at timestamptz not null default now(),
  visitor_hash text check (char_length(visitor_hash) <= 64),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost', 'spam')),
  assigned_to uuid references auth.users (id) on delete set null,
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create index leads_ws_idx on public.leads (workspace_id, created_at desc);
create trigger leads_updated_at before update on public.leads for each row execute function public.set_updated_at();
alter table public.leads enable row level security;
-- leads.view_all: owner, admin, marketing; leads.view_assigned: agent (przypisane lub z jego oferty).
create policy "leads: read by role" on public.leads for select to authenticated using (
  public.has_workspace_role(workspace_id, array['owner', 'admin', 'marketing'])
  or (public.has_workspace_role(workspace_id, array['agent']) and (
        assigned_to = auth.uid()
        or exists (select 1 from public.properties p where p.id = property_id and p.agent_id = auth.uid())))
);

create table public.lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('created', 'status', 'assigned', 'note')),
  detail jsonb not null default '{}'::jsonb,
  actor uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index lead_events_lead_idx on public.lead_events (lead_id, created_at);
alter table public.lead_events enable row level security;
create policy "lead events: read with lead" on public.lead_events for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

revoke insert, update, delete on public.publication_metrics, public.tracked_links, public.web_events, public.leads, public.lead_events from anon, authenticated;

-- Wnioski AI do raportu (zapisane, żeby PDF i ponowne otwarcie nie generowały kosztów).
create table public.analytics_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  period_from timestamptz not null,
  period_to timestamptz not null,
  insights jsonb not null,
  dropped jsonb not null default '[]'::jsonb,
  model text not null check (char_length(model) <= 80),
  version text not null check (char_length(version) <= 40),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index analytics_insights_ws_idx on public.analytics_insights (workspace_id, created_at desc);
alter table public.analytics_insights enable row level security;
create policy "insights: analytics readers" on public.analytics_insights for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent', 'marketing', 'viewer']));
revoke insert, update, delete on public.analytics_insights from anon, authenticated;
