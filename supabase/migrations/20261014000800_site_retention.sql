-- ETAP 3, faza 8: strona sprzedażowa (formularz kontaktowy, statystyki za zgodą) i retencja danych.

-- Wiadomości z formularza kontaktowego strony sprzedażowej (dla zespołu Ogarnio).
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company text check (char_length(company) <= 160),
  topic text not null default 'other' check (topic in ('demo', 'pricing', 'integration', 'other')),
  message text not null check (char_length(message) between 10 and 4000),
  consent_text text not null check (char_length(consent_text) <= 1000),
  consent_version text not null check (char_length(consent_version) <= 40),
  visitor_hash text check (char_length(visitor_hash) <= 64),
  status text not null default 'new' check (status in ('new', 'answered', 'spam')),
  created_at timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;

-- Odsłony strony sprzedażowej zapisywane WYŁĄCZNIE po zgodzie odwiedzającego (bez IP, skrót z dzienną solą).
create table public.site_events (
  id bigint generated always as identity primary key,
  path text not null check (char_length(path) <= 200),
  referrer_host text check (char_length(referrer_host) <= 200),
  utm_source text check (char_length(utm_source) <= 80),
  utm_campaign text check (char_length(utm_campaign) <= 120),
  visitor_hash text not null check (char_length(visitor_hash) <= 64),
  created_at timestamptz not null default now()
);
create index site_events_created_idx on public.site_events (created_at desc);
alter table public.site_events enable row level security;
revoke all on public.site_events from anon, authenticated;

-- Retencja: jedno wywołanie usuwa dane po terminach z polityki (docs/PRIVACY_RETENTION.md).
-- Dziennik administratora nie jest czyszczony (dowód rozliczalności; usuwanie ręczne po decyzji prawnej).
create function public.run_retention()
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
  return r;
end;
$$;
revoke execute on function public.run_retention() from public, anon, authenticated;
