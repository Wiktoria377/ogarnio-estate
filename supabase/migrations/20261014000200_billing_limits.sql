-- OGARNIO ESTATE · migration 008 · ETAP 3, faza 2: plans, subscriptions (Stripe),
-- central limits and the usage ledger. Access to paid operations depends only
-- on the subscription status written by verified Stripe webhooks.

-- ─────────────────────────────────────────────────────────────────────────────
-- Plans: editable in the OGARNIO admin panel (no code change needed)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.plans (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 400),
  -- Price in the smallest unit (grosze). Whether it is net or gross is an
  -- explicit setting, never assumed: 'unspecified' until the operator decides.
  price_minor integer not null default 0 check (price_minor >= 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  price_tax_mode text not null default 'unspecified' check (price_tax_mode in ('net', 'gross', 'unspecified')),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  stripe_price_id text unique check (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  is_public boolean not null default true,
  is_active boolean not null default true,
  sort integer not null default 0,
  trial_days integer not null default 14 check (trial_days between 0 and 60),
  -- Central limits. NULL is not allowed for paid compute (renders): no unlimited video.
  max_users integer not null check (max_users between 1 and 1000),
  max_properties integer not null check (max_properties between 0 and 100000),
  monthly_text_generations integer not null check (monthly_text_generations between 0 and 1000000),
  monthly_graphic_exports integer not null check (monthly_graphic_exports between 0 and 1000000),
  monthly_video_renders integer not null check (monthly_video_renders between 0 and 10000),
  storage_mb integer not null check (storage_mb between 0 and 10000000),
  max_social_accounts integer not null check (max_social_accounts between 0 and 1000),
  max_parallel_jobs integer not null default 2 check (max_parallel_jobs between 1 and 10),
  features text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create trigger plans_updated_at before update on public.plans for each row execute function public.set_updated_at();

alter table public.plans enable row level security;
-- Public pricing page and in-app plan picker read active public plans (no secrets in this table).
create policy "plans: public read" on public.plans for select to anon, authenticated using (is_active and is_public);
grant select on public.plans to anon, authenticated;
grant select, insert, update, delete on public.plans to service_role;

-- Default offer from the ETAP 3 brief. Limits are a proposal for the operator to tune.
insert into public.plans (id, name, description, price_minor, sort, is_public, trial_days, max_users, max_properties, monthly_text_generations, monthly_graphic_exports, monthly_video_renders, storage_mb, max_social_accounts, max_parallel_jobs, features) values
  ('trial', 'Okres próbny', 'Pełne funkcje z mniejszymi limitami na czas testu.', 0, 0, false, 14, 2, 15, 60, 60, 3, 2048, 2, 1, '{campaigns,graphics,video,brochures,planner,publishing,import,analytics}'),
  ('solo', 'Solo', 'Dla agenta działającego samodzielnie.', 14900, 1, true, 14, 1, 40, 300, 300, 10, 10240, 3, 1, '{campaigns,graphics,video,brochures,planner,publishing,import,analytics}'),
  ('studio', 'Studio', 'Dla małego biura z zespołem.', 34900, 2, true, 14, 5, 200, 1200, 1500, 40, 51200, 10, 2, '{campaigns,graphics,video,brochures,planner,publishing,import,analytics,team,reports}'),
  ('agency', 'Agency', 'Dla agencji i sieci biur.', 79900, 3, true, 14, 20, 2000, 4000, 6000, 120, 204800, 30, 3, '{campaigns,graphics,video,brochures,planner,publishing,import,analytics,team,reports,priority_support}');

-- ─────────────────────────────────────────────────────────────────────────────
-- Subscriptions: plan reference, Stripe fields, trial, per-office overrides
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.workspace_subscriptions drop constraint if exists workspace_subscriptions_plan_check;
alter table public.workspace_subscriptions drop constraint if exists workspace_subscriptions_status_check;
update public.workspace_subscriptions set plan = case plan when 'starter' then 'trial' when 'pro' then 'studio' else plan end;
alter table public.workspace_subscriptions
  alter column plan set default 'trial',
  add constraint workspace_subscriptions_plan_fk foreign key (plan) references public.plans (id),
  add constraint workspace_subscriptions_status_check check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
  add column if not exists trial_ends_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists provider_price_id text,
  add column if not exists provider_synced_at timestamptz,
  add column if not exists limit_overrides jsonb not null default '{}'::jsonb,
  add column if not exists trial_used boolean not null default false;

update public.workspace_subscriptions s set trial_ends_at = coalesce(s.trial_ends_at, w.created_at + interval '14 days')
from public.workspaces w where w.id = s.workspace_id and s.status = 'trialing';

-- Per-row limits from ETAP 2 are replaced by plan limits + overrides.
alter table public.workspace_subscriptions
  drop column if exists monthly_generation_limit,
  drop column if exists monthly_render_limit,
  drop column if exists max_parallel_jobs;

create unique index if not exists workspace_subscriptions_customer_idx on public.workspace_subscriptions (provider_customer_id) where provider_customer_id is not null;
create unique index if not exists workspace_subscriptions_sub_idx on public.workspace_subscriptions (provider_subscription_id) where provider_subscription_id is not null;

-- New offices start a trial (create_workspace inserts the row with defaults).
alter table public.workspace_subscriptions alter column trial_ends_at set default (now() + interval '14 days');

-- ─────────────────────────────────────────────────────────────────────────────
-- Effective limits and access state
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.workspace_limits(p_ws uuid)
returns table (
  plan_id text, plan_name text, status text, access text, access_reason text,
  max_users integer, max_properties integer, monthly_text_generations integer,
  monthly_graphic_exports integer, monthly_video_renders integer, storage_mb integer,
  max_social_accounts integer, max_parallel_jobs integer, trial_ends_at timestamptz,
  current_period_end timestamptz, cancel_at_period_end boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select ws.*, p.name as plan_name, p.max_users as p_users, p.max_properties as p_props,
      p.monthly_text_generations as p_text, p.monthly_graphic_exports as p_exports,
      p.monthly_video_renders as p_renders, p.storage_mb as p_storage,
      p.max_social_accounts as p_social, p.max_parallel_jobs as p_parallel
    from public.workspace_subscriptions ws join public.plans p on p.id = ws.plan
    where ws.workspace_id = p_ws
  ), a as (
    select s.*,
      case
        when s.status = 'active' then 'full'
        when s.status = 'trialing' and coalesce(s.trial_ends_at, now()) > now() then 'full'
        -- Stripe retries failed payments; keep working for 7 days after the period end.
        when s.status = 'past_due' and coalesce(s.current_period_end, now()) + interval '7 days' > now() then 'full'
        else 'read_only'
      end as access,
      case
        when s.status = 'trialing' and coalesce(s.trial_ends_at, now()) <= now() then 'trial_expired'
        when s.status = 'past_due' then 'payment_failed'
        when s.status in ('canceled', 'unpaid', 'incomplete_expired', 'paused') then s.status
        when s.status = 'incomplete' then 'payment_pending'
        else null
      end as reason
    from s
  )
  select a.plan, a.plan_name, a.status, a.access, a.reason,
    coalesce((a.limit_overrides ->> 'max_users')::integer, a.p_users),
    coalesce((a.limit_overrides ->> 'max_properties')::integer, a.p_props),
    coalesce((a.limit_overrides ->> 'monthly_text_generations')::integer, a.p_text),
    coalesce((a.limit_overrides ->> 'monthly_graphic_exports')::integer, a.p_exports),
    coalesce((a.limit_overrides ->> 'monthly_video_renders')::integer, a.p_renders),
    coalesce((a.limit_overrides ->> 'storage_mb')::integer, a.p_storage),
    coalesce((a.limit_overrides ->> 'max_social_accounts')::integer, a.p_social),
    coalesce((a.limit_overrides ->> 'max_parallel_jobs')::integer, a.p_parallel),
    a.trial_ends_at, a.current_period_end, a.cancel_at_period_end
  from a;
$$;

create or replace function public.can_view_usage(p_ws uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.role() = 'service_role' or public.is_workspace_member(p_ws);
$$;

revoke all on function public.workspace_limits(uuid) from public, anon, authenticated;
grant execute on function public.workspace_limits(uuid) to service_role;
revoke all on function public.can_view_usage(uuid) from public, anon;
grant execute on function public.can_view_usage(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Usage ledger: append-only, idempotent, enforced atomically
-- ─────────────────────────────────────────────────────────────────────────────
create table public.usage_ledger (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  metric text not null check (metric in ('text_generation', 'graphic_export', 'video_render', 'publication', 'ai_insight')),
  quantity integer not null check (quantity <> 0 and quantity between -1000 and 1000),
  user_id uuid references auth.users (id) on delete set null,
  ref_type text check (char_length(ref_type) <= 40),
  ref_id text check (char_length(ref_id) <= 120),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);
create index usage_ledger_month_idx on public.usage_ledger (workspace_id, metric, created_at);
alter table public.usage_ledger enable row level security;
create policy "ledger: members read" on public.usage_ledger for select to authenticated using (public.is_workspace_member(workspace_id));
grant select on public.usage_ledger to authenticated;
grant select, insert on public.usage_ledger to service_role;

create or replace function public.metric_limit(p_ws uuid, p_metric text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case p_metric
    when 'text_generation' then l.monthly_text_generations
    when 'ai_insight' then l.monthly_text_generations
    when 'graphic_export' then l.monthly_graphic_exports
    when 'video_render' then l.monthly_video_renders
    else null end
  from public.workspace_limits(p_ws) l;
$$;
revoke all on function public.metric_limit(uuid, text) from public, anon, authenticated;
grant execute on function public.metric_limit(uuid, text) to service_role;

-- Used this month (Europe/Warsaw). AI insights share the text-generation pool.
create or replace function public.metric_used(p_ws uuid, p_metric text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantity), 0)::integer from public.usage_ledger
  where workspace_id = p_ws and created_at >= public.month_start_warsaw()
    and (metric = p_metric or (p_metric in ('text_generation', 'ai_insight') and metric in ('text_generation', 'ai_insight')));
$$;
revoke all on function public.metric_used(uuid, text) from public, anon, authenticated;
grant execute on function public.metric_used(uuid, text) to service_role;

/*
 * Reserves usage before a paid operation. Idempotent per key (a repeated call
 * with the same key returns without charging again). Raises:
 *   subscription_inactive  – trial expired / canceled / unpaid
 *   usage_limit_reached    – monthly limit for the metric would be exceeded
 */
create or replace function public.consume_usage(p_ws uuid, p_metric text, p_quantity integer, p_key text, p_ref_type text default null, p_ref_id text default null)
returns table (used integer, monthly_limit integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access text;
  v_limit integer;
  v_used integer;
  v_uid uuid := auth.uid();
begin
  if v_uid is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  -- Downloads (exports) are allowed for every active member; generation needs an editing role.
  if v_uid is not null and not (case when p_metric = 'graphic_export' then public.is_workspace_member(p_ws)
                                     else public.has_workspace_role(p_ws, array['owner', 'admin', 'agent', 'marketing']) end) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_quantity <= 0 then
    raise exception 'bad_quantity' using errcode = '22023';
  end if;
  -- Serialise reservations of one office and metric.
  perform pg_advisory_xact_lock(hashtextextended(p_ws::text || ':' || p_metric, 0));
  if exists (select 1 from public.usage_ledger where workspace_id = p_ws and idempotency_key = p_key) then
    return query select public.metric_used(p_ws, p_metric), public.metric_limit(p_ws, p_metric);
    return;
  end if;
  select l.access into v_access from public.workspace_limits(p_ws) l;
  if v_access is distinct from 'full' then
    raise exception 'subscription_inactive' using errcode = 'P0001';
  end if;
  v_limit := public.metric_limit(p_ws, p_metric);
  v_used := public.metric_used(p_ws, p_metric);
  if v_limit is not null and v_used + p_quantity > v_limit then
    raise exception 'usage_limit_reached:%:%:%', p_metric, v_used, v_limit using errcode = 'P0001';
  end if;
  insert into public.usage_ledger (workspace_id, metric, quantity, user_id, ref_type, ref_id, idempotency_key)
  values (p_ws, p_metric, p_quantity, v_uid, p_ref_type, p_ref_id, p_key);
  return query select v_used + p_quantity, v_limit;
end;
$$;
revoke all on function public.consume_usage(uuid, text, integer, text, text, text) from public, anon;
grant execute on function public.consume_usage(uuid, text, integer, text, text, text) to authenticated, service_role;

-- Refund of a reservation whose operation failed (once per key). Server only.
create or replace function public.refund_usage(p_ws uuid, p_key text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.usage_ledger;
begin
  select * into v from public.usage_ledger where workspace_id = p_ws and idempotency_key = p_key;
  if v.id is null or v.quantity <= 0 then
    return false;
  end if;
  insert into public.usage_ledger (workspace_id, metric, quantity, user_id, ref_type, ref_id, idempotency_key, note)
  values (p_ws, v.metric, -v.quantity, v.user_id, v.ref_type, v.ref_id, 'refund:' || p_key, left(p_note, 200))
  on conflict (workspace_id, idempotency_key) do nothing;
  return found;
end;
$$;
revoke all on function public.refund_usage(uuid, text, text) from public, anon, authenticated;
grant execute on function public.refund_usage(uuid, text, text) to service_role;

-- Usage summary for the settings page and limits banner (members only).
create or replace function public.usage_summary(p_ws uuid)
returns table (
  plan_id text, plan_name text, status text, access text, access_reason text,
  trial_ends_at timestamptz, current_period_end timestamptz, cancel_at_period_end boolean,
  text_used integer, text_limit integer, exports_used integer, exports_limit integer,
  renders_used integer, renders_limit integer, users_used integer, users_limit integer,
  properties_used integer, properties_limit integer, social_used integer, social_limit integer,
  storage_used_mb numeric, storage_limit_mb integer, max_parallel_jobs integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.is_workspace_member(p_ws)) then
    return;
  end if;
  return query
  select l.plan_id, l.plan_name, l.status, l.access, l.access_reason, l.trial_ends_at, l.current_period_end, l.cancel_at_period_end,
    public.metric_used(p_ws, 'text_generation'), l.monthly_text_generations,
    public.metric_used(p_ws, 'graphic_export'), l.monthly_graphic_exports,
    public.metric_used(p_ws, 'video_render'), l.monthly_video_renders,
    public.seats_used(p_ws), l.max_users,
    (select count(*)::integer from public.properties p where p.workspace_id = p_ws and p.status <> 'archived'), l.max_properties,
    public.social_accounts_used(p_ws), l.max_social_accounts,
    round(public.storage_used_bytes(p_ws) / 1048576.0, 1), l.storage_mb, l.max_parallel_jobs
  from public.workspace_limits(p_ws) l;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Count-based limits enforced by triggers (cannot be bypassed through the API)
-- ─────────────────────────────────────────────────────────────────────────────
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
       + coalesce((select sum(size_bytes) from public.media_assets where workspace_id = p_ws), 0);
$$;

-- Seats: active members plus open invitations (table created in migration 009;
-- until then only members count).
create or replace function public.seats_used(p_ws uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  select count(*) into v from public.workspace_members where workspace_id = p_ws and status = 'active';
  if to_regclass('public.workspace_invitations') is not null then
    execute 'select $1 + count(*) from public.workspace_invitations where workspace_id = $2 and accepted_at is null and revoked_at is null and expires_at > now()'
      into v using v, p_ws;
  end if;
  return v;
end;
$$;

-- Social accounts: defined in migration 010; placeholder returns 0 until then.
create or replace function public.social_accounts_used(p_ws uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v integer := 0;
begin
  if to_regclass('public.social_connections') is not null then
    execute 'select count(*) from public.social_connections where workspace_id = $1 and status <> ''disconnected'''
      into v using p_ws;
  end if;
  return v;
end;
$$;

revoke all on function public.storage_used_bytes(uuid) from public, anon, authenticated;
revoke all on function public.seats_used(uuid) from public, anon, authenticated;
revoke all on function public.social_accounts_used(uuid) from public, anon, authenticated;
grant execute on function public.storage_used_bytes(uuid), public.seats_used(uuid), public.social_accounts_used(uuid) to service_role;
revoke all on function public.usage_summary(uuid) from public, anon;
grant execute on function public.usage_summary(uuid) to authenticated, service_role;

create or replace function public.enforce_property_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
begin
  select l.max_properties into v_limit from public.workspace_limits(new.workspace_id) l;
  select count(*) into v_used from public.properties where workspace_id = new.workspace_id and status <> 'archived';
  if v_limit is not null and v_used >= v_limit then
    raise exception 'plan_limit:max_properties:%', v_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger properties_plan_limit before insert on public.properties for each row execute function public.enforce_property_limit();

create or replace function public.enforce_storage_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  select l.storage_mb into v_limit from public.workspace_limits(new.workspace_id) l;
  if v_limit is not null and public.storage_used_bytes(new.workspace_id) + new.size_bytes > v_limit::bigint * 1048576 then
    raise exception 'plan_limit:storage_mb:%', v_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger property_photos_storage_limit before insert on public.property_photos for each row execute function public.enforce_storage_limit();
create trigger brand_assets_storage_limit before insert on public.brand_assets for each row execute function public.enforce_storage_limit();
create trigger rendered_files_storage_limit before insert on public.rendered_files for each row execute function public.enforce_storage_limit();
create trigger media_assets_storage_limit before insert on public.media_assets for each row execute function public.enforce_storage_limit();

revoke all on function public.enforce_property_limit() from public, anon, authenticated;
revoke all on function public.enforce_storage_limit() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Existing quota RPCs now read the ledger (kept for compatibility)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.ai_quota_status(p_ws uuid)
returns table (used integer, monthly_limit integer)
language sql
stable
security definer
set search_path = ''
as $$
  select public.metric_used(p_ws, 'text_generation'), public.metric_limit(p_ws, 'text_generation')
  where coalesce(auth.role(), '') = 'service_role' or public.is_workspace_member(p_ws);
$$;
create or replace function public.render_quota_status(p_ws uuid)
returns table (used integer, monthly_limit integer)
language sql
stable
security definer
set search_path = ''
as $$
  select public.metric_used(p_ws, 'video_render'), public.metric_limit(p_ws, 'video_render')
  where coalesce(auth.role(), '') = 'service_role' or public.is_workspace_member(p_ws);
$$;
grant execute on function public.ai_quota_status(uuid), public.render_quota_status(uuid) to authenticated, service_role;

-- Queue parallelism from effective limits.
create or replace function public.claim_generation_job(p_worker text, p_stale_seconds integer default 600)
returns setof public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.generation_jobs j
  set status = case when j.attempts >= j.max_attempts then 'failed' else 'queued' end,
      error_message = case when j.attempts >= j.max_attempts
        then 'Zadanie zostało przerwane (restart serwera). Spróbuj ponownie.' else j.error_message end,
      error_code = case when j.attempts >= j.max_attempts then 'stale' else j.error_code end,
      finished_at = case when j.attempts >= j.max_attempts then now() else null end,
      locked_at = null, locked_by = null
  where j.status = 'running' and j.locked_at < now() - make_interval(secs => p_stale_seconds);

  select j.id into v_id
  from public.generation_jobs j
  where j.status = 'queued' and j.run_after <= now()
    and (select count(*) from public.generation_jobs r
         where r.workspace_id = j.workspace_id and r.status = 'running')
        < coalesce((select l.max_parallel_jobs from public.workspace_limits(j.workspace_id) l), 2)
    and (j.kind <> 'video_render' or not exists (
         select 1 from public.generation_jobs r
         where r.workspace_id = j.workspace_id and r.status = 'running' and r.kind = 'video_render'))
  order by j.run_after, j.created_at
  for update skip locked
  limit 1;

  if v_id is null then
    return;
  end if;

  return query
  update public.generation_jobs
  set status = 'running', attempts = attempts + 1, locked_at = now(), locked_by = p_worker,
      started_at = coalesce(started_at, now()), progress = 0
  where id = v_id
  returning *;
end;
$$;
revoke all on function public.claim_generation_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_generation_job(text, integer) to service_role;

-- Backfill the ledger with this month's ETAP 2 usage so limits stay correct after the switch.
insert into public.usage_ledger (workspace_id, metric, quantity, user_id, ref_type, ref_id, idempotency_key, note, created_at)
select e.workspace_id, 'text_generation', 1, e.user_id, 'ai_usage_event', e.id::text, 'backfill:ai:' || e.id, 'migracja 008', e.created_at
from public.ai_usage_events e
where e.status = 'ok' and e.operation in ('generate', 'refine', 'graphic_copy', 'campaign_brief', 'video_script')
  and e.created_at >= public.month_start_warsaw()
on conflict do nothing;
insert into public.usage_ledger (workspace_id, metric, quantity, user_id, ref_type, ref_id, idempotency_key, note, created_at)
select j.workspace_id, 'video_render', 1, j.created_by, 'job', j.id::text, 'render:job:' || j.id, 'migracja 008', j.created_at
from public.generation_jobs j
where j.kind = 'video_render' and j.status in ('queued', 'running', 'succeeded') and j.created_at >= public.month_start_warsaw()
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Stripe: processed webhook events (idempotency) and invoices (payment history)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.billing_events (
  id text primary key check (id ~ '^evt_[A-Za-z0-9]+$'),
  type text not null check (char_length(type) <= 100),
  workspace_id uuid references public.workspaces (id) on delete set null,
  stripe_created timestamptz not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error text check (char_length(error) <= 500),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.billing_events enable row level security;
grant select, insert, update on public.billing_events to service_role;

create table public.billing_invoices (
  id text primary key check (id ~ '^in_[A-Za-z0-9]+$'),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  number text check (char_length(number) <= 80),
  status text not null check (status in ('draft', 'open', 'paid', 'uncollectible', 'void')),
  amount_due integer not null default 0,
  amount_paid integer not null default 0,
  currency text not null check (char_length(currency) = 3),
  hosted_invoice_url text check (hosted_invoice_url ~ '^https://'),
  invoice_pdf text check (invoice_pdf ~ '^https://'),
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index billing_invoices_ws_idx on public.billing_invoices (workspace_id, created_at desc);
create trigger billing_invoices_updated_at before update on public.billing_invoices for each row execute function public.set_updated_at();
alter table public.billing_invoices enable row level security;
-- Payment history: owner only (billing).
create policy "invoices: owner read" on public.billing_invoices for select to authenticated using (public.has_workspace_role(workspace_id, array['owner']));
grant select on public.billing_invoices to authenticated;
grant select, insert, update on public.billing_invoices to service_role;
grant select, update on public.workspace_subscriptions to service_role;
