-- OGARNIO ESTATE · migration 006 · ETAP 2: campaigns, generation jobs, rendered
-- files, schedule, export history, saved templates, render limits.
-- Every table carries workspace_id; composite foreign keys (id, workspace_id)
-- make it impossible to link a row to an object from another workspace.

-- ─────────────────────────────────────────────────────────────────────────────
-- Existing tables: new material kinds, render limits
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.content_items drop constraint if exists content_items_kind_check;
alter table public.content_items add constraint content_items_kind_check
  check (kind in ('text', 'graphic', 'video', 'document'));

alter table public.workspace_subscriptions
  add column if not exists monthly_render_limit integer not null default 40 check (monthly_render_limit >= 0),
  add column if not exists max_parallel_jobs integer not null default 2 check (max_parallel_jobs between 1 and 10);

-- ─────────────────────────────────────────────────────────────────────────────
-- Campaigns: one property → a set of coordinated materials
-- ─────────────────────────────────────────────────────────────────────────────
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  property_id uuid,
  name text not null check (char_length(name) between 2 and 160),
  goal text not null check (goal in ('buyers', 'new_listing', 'price_drop', 'premium', 'open_house', 'agent_brand')),
  audience text not null check (char_length(audience) between 1 and 300),
  style text not null check (style in ('brand', 'premium', 'warm', 'expert', 'direct', 'energetic')),
  platforms text[] not null check (cardinality(platforms) between 1 and 6),
  deliverables text[] not null check (cardinality(deliverables) between 1 and 12),
  -- Goal-specific inputs (open-house date, previous price, notes), validated by the server.
  options jsonb not null default '{}'::jsonb,
  -- Structured brief from the AI Marketing Director (versioned instructions).
  brief jsonb,
  brief_version text check (char_length(brief_version) <= 40),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (property_id, workspace_id) references public.properties (id, workspace_id)
    on delete set null (property_id)
);

create index campaigns_ws_idx on public.campaigns (workspace_id, updated_at desc);
create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

-- Material ↔ campaign link: one row per deliverable of a campaign.
create table public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  deliverable text not null check (char_length(deliverable) <= 40),
  content_item_id uuid,
  created_at timestamptz not null default now(),
  unique (campaign_id, deliverable),
  foreign key (campaign_id, workspace_id) references public.campaigns (id, workspace_id) on delete cascade,
  foreign key (content_item_id, workspace_id) references public.content_items (id, workspace_id)
    on delete set null (content_item_id)
);

create index campaign_assets_item_idx on public.campaign_assets (content_item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Generation jobs: server-side queue (AI copy, graphics, PDF, video render)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid,
  content_item_id uuid,
  kind text not null check (kind in ('campaign_brief', 'campaign_asset', 'video_render')),
  deliverable text check (char_length(deliverable) <= 40),
  label text not null check (char_length(label) between 1 and 160),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  manual_retries integer not null default 0 check (manual_retries between 0 and 5),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  progress smallint not null default 0 check (progress between 0 and 100),
  result jsonb,
  error_message text check (char_length(error_message) <= 500),
  error_code text check (char_length(error_code) <= 60),
  -- Prompt and skills versions used, for reproducibility.
  instructions_version text check (char_length(instructions_version) <= 80),
  -- Prevents double submission of the same work while it is still pending.
  dedupe_key text check (char_length(dedupe_key) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (campaign_id, workspace_id) references public.campaigns (id, workspace_id) on delete cascade,
  foreign key (content_item_id, workspace_id) references public.content_items (id, workspace_id) on delete cascade
);

create index generation_jobs_queue_idx on public.generation_jobs (status, run_after) where status in ('queued', 'running');
create index generation_jobs_ws_idx on public.generation_jobs (workspace_id, created_at desc);
create index generation_jobs_campaign_idx on public.generation_jobs (campaign_id, created_at);
create unique index generation_jobs_dedupe_idx on public.generation_jobs (workspace_id, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');

create trigger generation_jobs_updated_at before update on public.generation_jobs
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Rendered files (MP4, PDF) produced by jobs; stored in workspace storage
-- ─────────────────────────────────────────────────────────────────────────────
create table public.rendered_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  content_item_id uuid not null,
  version integer not null check (version > 0),
  kind text not null check (kind in ('video_mp4', 'brochure_pdf')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('video/mp4', 'application/pdf')),
  size_bytes integer not null check (size_bytes > 0),
  meta jsonb not null default '{}'::jsonb,
  job_id uuid references public.generation_jobs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (content_item_id, workspace_id) references public.content_items (id, workspace_id) on delete cascade
);

create index rendered_files_item_idx on public.rendered_files (content_item_id, created_at desc);

-- User-owned media (audio for Reels). Rights must be confirmed on upload.
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('audio')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/aac')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  duration_ms integer check (duration_ms > 0),
  label text not null check (char_length(label) between 1 and 160),
  rights_confirmed_at timestamptz not null,
  rights_note text check (char_length(rights_note) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Marketing planner
-- ─────────────────────────────────────────────────────────────────────────────
create table public.schedule_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid,
  name text not null check (char_length(name) between 2 and 160),
  start_date date not null,
  days smallint not null check (days in (7, 14, 30)),
  posts_per_week smallint not null check (posts_per_week between 1 and 14),
  channels text[] not null check (cardinality(channels) between 1 and 6),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (campaign_id, workspace_id) references public.campaigns (id, workspace_id) on delete set null (campaign_id)
);

create table public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id uuid,
  campaign_id uuid,
  content_item_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  channel text not null check (channel in ('instagram', 'facebook', 'tiktok', 'linkedin', 'meta_ads', 'email', 'website', 'other')),
  scheduled_at timestamptz not null,
  status text not null default 'idea' check (status in ('idea', 'in_progress', 'for_approval', 'ready', 'published')),
  notes text check (char_length(notes) <= 1000),
  published_at timestamptz,
  -- Prepared for future publishing integrations (Meta, TikTok, LinkedIn). Not used yet.
  publish_provider text check (publish_provider in ('manual', 'meta', 'tiktok', 'linkedin')),
  external_post_id text check (char_length(external_post_id) <= 200),
  external_url text check (char_length(external_url) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (plan_id, workspace_id) references public.schedule_plans (id, workspace_id) on delete cascade,
  foreign key (campaign_id, workspace_id) references public.campaigns (id, workspace_id) on delete set null (campaign_id),
  foreign key (content_item_id, workspace_id) references public.content_items (id, workspace_id) on delete set null (content_item_id)
);

create index schedule_entries_ws_time_idx on public.schedule_entries (workspace_id, scheduled_at);
create trigger schedule_entries_updated_at before update on public.schedule_entries
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Export history (append-only) and saved graphic templates
-- ─────────────────────────────────────────────────────────────────────────────
create table public.export_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  content_item_id uuid,
  user_id uuid references auth.users (id) on delete set null,
  format text not null check (format in ('png', 'jpg', 'pdf', 'zip', 'mp4', 'txt', 'md')),
  version integer,
  size_bytes integer,
  created_at timestamptz not null default now(),
  foreign key (content_item_id, workspace_id) references public.content_items (id, workspace_id) on delete set null (content_item_id)
);

create index export_events_item_idx on public.export_events (content_item_id, created_at desc);

create table public.design_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  base_template text not null check (char_length(base_template) <= 40),
  format text not null check (char_length(format) <= 20),
  -- Look and layout only (colours, fonts, element overrides, slide structure); never photos or facts.
  design jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index design_templates_ws_idx on public.design_templates (workspace_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.campaigns enable row level security;
alter table public.campaign_assets enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.rendered_files enable row level security;
alter table public.media_assets enable row level security;
alter table public.schedule_plans enable row level security;
alter table public.schedule_entries enable row level security;
alter table public.export_events enable row level security;
alter table public.design_templates enable row level security;

-- campaigns
create policy "campaigns: members read" on public.campaigns
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "campaigns: editors insert" on public.campaigns
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']) and created_by = auth.uid());
create policy "campaigns: editors update" on public.campaigns
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));
create policy "campaigns: editors delete" on public.campaigns
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));

-- campaign_assets
create policy "campaign assets: members read" on public.campaign_assets
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "campaign assets: editors write" on public.campaign_assets
  for insert to authenticated with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));
create policy "campaign assets: editors update" on public.campaign_assets
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));
create policy "campaign assets: editors delete" on public.campaign_assets
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));

-- generation_jobs: users may read and enqueue; state transitions happen only in
-- the worker (service role) or through retry/cancel functions below.
create policy "jobs: members read" on public.generation_jobs
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "jobs: editors enqueue" on public.generation_jobs
  for insert to authenticated
  with check (
    public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent'])
    and created_by = auth.uid() and status = 'queued' and attempts = 0 and manual_retries = 0
    and result is null and locked_at is null and max_attempts <= 3
  );

-- rendered_files: written by the worker only; members read
create policy "rendered: members read" on public.rendered_files
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "rendered: editors delete" on public.rendered_files
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));

-- media_assets
create policy "media: members read" on public.media_assets
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "media: editors insert" on public.media_assets
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']) and created_by = auth.uid());
create policy "media: editors delete" on public.media_assets
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));

-- planner
create policy "plans: members read" on public.schedule_plans
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "plans: editors insert" on public.schedule_plans
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']) and created_by = auth.uid());
create policy "plans: editors delete" on public.schedule_plans
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));

create policy "schedule: members read" on public.schedule_entries
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "schedule: editors insert" on public.schedule_entries
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']) and created_by = auth.uid());
create policy "schedule: editors update" on public.schedule_entries
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));
create policy "schedule: editors delete" on public.schedule_entries
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));

-- export history: append-only
create policy "exports: members read" on public.export_events
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "exports: self insert" on public.export_events
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and user_id = auth.uid());

-- saved templates
create policy "templates: members read" on public.design_templates
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "templates: editors insert" on public.design_templates
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']) and created_by = auth.uid());
create policy "templates: editors delete" on public.design_templates
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));

-- ─────────────────────────────────────────────────────────────────────────────
-- Job queue functions
-- ─────────────────────────────────────────────────────────────────────────────

-- Worker: claims the next runnable job. Respects per-workspace parallelism
-- (max_parallel_jobs) and one video render per workspace at a time. Jobs whose
-- worker died (lock older than p_stale_seconds) are requeued or failed.
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
        < coalesce((select s.max_parallel_jobs from public.workspace_subscriptions s where s.workspace_id = j.workspace_id), 2)
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

-- User: retry a failed or canceled job (bounded number of manual retries).
create or replace function public.retry_generation_job(p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.generation_jobs;
begin
  select * into v from public.generation_jobs where id = p_job for update;
  if v.id is null or not public.has_workspace_role(v.workspace_id, array['owner', 'admin', 'agent']) then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if v.status not in ('failed', 'canceled') then
    raise exception 'job_not_retryable' using errcode = '55000';
  end if;
  if v.manual_retries >= 5 then
    raise exception 'job_retry_limit' using errcode = '54000';
  end if;
  update public.generation_jobs
  set status = 'queued', attempts = 0, manual_retries = manual_retries + 1, run_after = now(),
      error_message = null, error_code = null, result = null, progress = 0,
      locked_at = null, locked_by = null, finished_at = null
  where id = p_job;
end;
$$;

revoke all on function public.retry_generation_job(uuid) from public, anon;
grant execute on function public.retry_generation_job(uuid) to authenticated;

-- User: cancel a job that has not started yet.
create or replace function public.cancel_generation_job(p_job uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.generation_jobs;
begin
  select * into v from public.generation_jobs where id = p_job for update;
  if v.id is null or not public.has_workspace_role(v.workspace_id, array['owner', 'admin', 'agent']) then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if v.status <> 'queued' then
    raise exception 'job_not_cancelable' using errcode = '55000';
  end if;
  update public.generation_jobs
  set status = 'canceled', finished_at = now(), error_message = 'Anulowane przez użytkownika.', error_code = 'canceled'
  where id = p_job;
end;
$$;

revoke all on function public.cancel_generation_job(uuid) from public, anon;
grant execute on function public.cancel_generation_job(uuid) to authenticated;

-- Worker-side version append: same as add_content_version, with the job's author
-- recorded explicitly (the service role has no auth.uid()).
create or replace function public.add_content_version_as(
  p_actor uuid,
  p_item uuid,
  p_body jsonb,
  p_source text,
  p_operation text default null,
  p_skills jsonb default '[]'::jsonb,
  p_quality jsonb default null,
  p_model text default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_ws uuid;
  v_next integer;
begin
  select workspace_id into v_ws from public.content_items where id = p_item for update;
  if v_ws is null then
    raise exception 'content_not_found' using errcode = 'P0002';
  end if;
  select coalesce(max(version), 0) + 1 into v_next from public.content_versions where item_id = p_item;
  insert into public.content_versions (item_id, workspace_id, version, body, source, operation, skills_used, quality, model, created_by)
  values (p_item, v_ws, v_next, p_body, p_source, p_operation, coalesce(p_skills, '[]'::jsonb), p_quality, p_model, p_actor);
  update public.content_items set current_version = v_next, updated_by = p_actor where id = p_item;
  return v_next;
end;
$$;

revoke all on function public.add_content_version_as(uuid, uuid, jsonb, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.add_content_version_as(uuid, uuid, jsonb, text, text, jsonb, jsonb, text) to service_role;

-- Quotas: AI counts campaign operations too; renders have their own monthly limit.
create or replace function public.ai_quota_status(p_ws uuid)
returns table (used integer, monthly_limit integer)
language sql
stable
set search_path = ''
as $$
  select
    (select count(*)::integer from public.ai_usage_events e
      where e.workspace_id = p_ws and e.status = 'ok'
        and e.operation in ('generate', 'refine', 'graphic_copy', 'campaign_brief', 'video_script')
        and e.created_at >= date_trunc('month', now())),
    coalesce((select s.monthly_generation_limit from public.workspace_subscriptions s where s.workspace_id = p_ws), 0);
$$;

create or replace function public.render_quota_status(p_ws uuid)
returns table (used integer, monthly_limit integer)
language sql
stable
set search_path = ''
as $$
  select
    (select count(*)::integer from public.generation_jobs j
      where j.workspace_id = p_ws and j.kind = 'video_render' and j.status in ('queued', 'running', 'succeeded')
        and j.created_at >= date_trunc('month', now())),
    coalesce((select s.monthly_render_limit from public.workspace_subscriptions s where s.workspace_id = p_ws), 0);
$$;

revoke all on function public.render_quota_status(uuid) from public, anon;
grant execute on function public.render_quota_status(uuid) to authenticated, service_role;
grant execute on function public.ai_quota_status(uuid) to service_role;

-- Service role needs table access for the worker (RLS is bypassed by that role).
grant select, insert, update, delete on public.campaigns, public.campaign_assets, public.generation_jobs,
  public.rendered_files, public.media_assets, public.schedule_plans, public.schedule_entries,
  public.design_templates to service_role;
grant select, insert on public.export_events to service_role;

-- Storage bucket: rendered MP4/PDF and user audio (skipped without the storage schema).
do $migration$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present, skipping bucket update';
    return;
  end if;
  update storage.buckets
  set file_size_limit = 104857600,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf',
                                 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/aac']
  where id = 'workspace-files';
end;
$migration$;
