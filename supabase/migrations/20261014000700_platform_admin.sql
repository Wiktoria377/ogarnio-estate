-- ETAP 3, faza 7: panel administratora platformy, dziennik działań, stawki kosztów i budżety.
-- Wszystkie tabele są dostępne wyłącznie dla roli serwisowej (brak polityk RLS dla
-- authenticated/anon); uprawnienia administratora sprawdza serwer przy każdym żądaniu.

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'viewer')),
  note text check (char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- Dziennik działań administracyjnych: tylko dopisywanie (brak edycji i usuwania, także dla roli serwisowej przez API).
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor uuid references auth.users (id) on delete set null,
  actor_email text check (char_length(actor_email) <= 200),
  action text not null check (char_length(action) between 1 and 80),
  target_type text check (char_length(target_type) <= 40),
  target_id text check (char_length(target_id) <= 120),
  workspace_id uuid references public.workspaces (id) on delete set null,
  reason text check (char_length(reason) <= 500),
  detail jsonb not null default '{}'::jsonb,
  ip text check (char_length(ip) <= 64),
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_ws_idx on public.admin_audit_log (workspace_id, created_at desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
create function public.admin_audit_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'admin_audit_log is append-only' using errcode = '42501';
end;
$$;
create trigger admin_audit_log_no_update before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_immutable();

-- Stawki kosztów ustawiane przez administratora (szacunki; faktyczne faktury u dostawców).
-- kind: ai_input_mtok / ai_output_mtok (za 1 mln tokenów, per model albo '*'),
--       video_render_minute (za minutę renderowania), storage_gb_month (za GB miesięcznie).
create table public.cost_rates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ai_input_mtok', 'ai_output_mtok', 'video_render_minute', 'storage_gb_month')),
  model text not null default '*' check (char_length(model) between 1 and 80),
  amount numeric(12, 4) not null check (amount >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'PLN', 'EUR')),
  note text check (char_length(note) <= 300),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (kind, model)
);
alter table public.cost_rates enable row level security;
revoke all on public.cost_rates from anon, authenticated;

-- Miesięczne budżety bezpieczeństwa platformy dla operacji z płatną infrastrukturą.
create table public.platform_budgets (
  category text primary key check (category in ('ai', 'video_render')),
  monthly_limit numeric(12, 2) not null check (monthly_limit >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'PLN', 'EUR')),
  alert_pct integer not null default 80 check (alert_pct between 1 and 100),
  enabled boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.platform_budgets enable row level security;
revoke all on public.platform_budgets from anon, authenticated;

-- Zużycie AI w bieżącym miesiącu (Europe/Warsaw) pogrupowane po modelu: podstawa szacunku kosztów i budżetu.
create function public.ai_usage_month(p_from timestamptz default null, p_to timestamptz default null)
returns table (workspace_id uuid, operation text, model text, calls bigint, errors bigint, input_tokens bigint, output_tokens bigint)
language sql stable security definer set search_path = public as $$
  select e.workspace_id, e.operation, coalesce(e.model, '?'), count(*) filter (where e.status = 'ok'), count(*) filter (where e.status <> 'ok'),
         coalesce(sum(e.input_tokens), 0)::bigint, coalesce(sum(e.output_tokens), 0)::bigint
  from public.ai_usage_events e
  where e.created_at >= coalesce(p_from, public.month_start_warsaw()) and e.created_at < coalesce(p_to, now() + interval '1 minute')
  group by 1, 2, 3;
$$;
revoke execute on function public.ai_usage_month(timestamptz, timestamptz) from public, anon, authenticated;

-- Czas renderowania wideo (sekundy) per biuro w okresie.
create function public.render_seconds(p_from timestamptz default null, p_to timestamptz default null)
returns table (workspace_id uuid, renders bigint, failed bigint, seconds numeric)
language sql stable security definer set search_path = public as $$
  select j.workspace_id, count(*) filter (where j.status = 'succeeded'), count(*) filter (where j.status = 'failed'),
         coalesce(sum(extract(epoch from (j.finished_at - j.started_at))) filter (where j.started_at is not null and j.finished_at is not null), 0)
  from public.generation_jobs j
  where j.kind = 'video_render' and j.created_at >= coalesce(p_from, public.month_start_warsaw()) and j.created_at < coalesce(p_to, now() + interval '1 minute')
  group by 1;
$$;
revoke execute on function public.render_seconds(timestamptz, timestamptz) from public, anon, authenticated;

-- Zajętość miejsca per biuro (te same tabele co limit planu + pliki publikacji).
create function public.storage_by_workspace()
returns table (workspace_id uuid, bytes bigint)
language sql stable security definer set search_path = public as $$
  select w.id, (public.storage_used_bytes(w.id) + coalesce((select sum(size_bytes) from public.publication_files f where f.workspace_id = w.id), 0))::bigint
  from public.workspaces w;
$$;
revoke execute on function public.storage_by_workspace() from public, anon, authenticated;

-- Przegląd biur dla panelu administratora: wyłącznie liczby i metadane, bez treści materiałów.
create function public.admin_workspaces()
returns table (id uuid, name text, created_at timestamptz, onboarding_completed_at timestamptz, plan text, status text, provider text,
               trial_ends_at timestamptz, current_period_end timestamptz, members bigint, properties bigint, content_items bigint,
               exports bigint, published bigint, last_activity timestamptz)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, w.created_at, w.onboarding_completed_at, s.plan, s.status, s.provider, s.trial_ends_at, s.current_period_end,
         (select count(*) from public.workspace_members m where m.workspace_id = w.id and m.status = 'active'),
         (select count(*) from public.properties p where p.workspace_id = w.id),
         (select count(*) from public.content_items c where c.workspace_id = w.id),
         (select count(*) from public.export_events x where x.workspace_id = w.id),
         (select count(*) from public.publications u where u.workspace_id = w.id and u.state = 'published'),
         greatest(w.updated_at, (select max(c.updated_at) from public.content_items c where c.workspace_id = w.id), (select max(e.created_at) from public.ai_usage_events e where e.workspace_id = w.id))
  from public.workspaces w
  left join public.workspace_subscriptions s on s.workspace_id = w.id;
$$;
revoke execute on function public.admin_workspaces() from public, anon, authenticated;
