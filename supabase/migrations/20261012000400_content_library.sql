-- OGARNIO ESTATE · migration 004 · Marketing library: materials, versions, AI usage.

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  property_id uuid,
  kind text not null check (kind in ('text', 'graphic')),
  content_type text not null check (char_length(content_type) <= 80),
  title text not null check (char_length(title) between 1 and 200),
  platform text check (char_length(platform) <= 40),
  status text not null default 'draft' check (status in ('draft', 'review', 'ready')),
  current_version integer not null default 1,
  params jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (property_id, workspace_id) references public.properties (id, workspace_id)
    on delete set null (property_id)
);

create index content_items_ws_idx on public.content_items (workspace_id, updated_at desc);
create index content_items_property_idx on public.content_items (property_id);

create trigger content_items_updated_at before update on public.content_items
  for each row execute function public.set_updated_at();

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  workspace_id uuid not null,
  version integer not null check (version > 0),
  body jsonb not null,
  source text not null check (source in ('ai_generate', 'ai_refine', 'manual', 'template', 'duplicate')),
  operation text check (char_length(operation) <= 60),
  skills_used jsonb not null default '[]'::jsonb,
  quality jsonb,
  model text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (item_id, version),
  foreign key (item_id, workspace_id) references public.content_items (id, workspace_id) on delete cascade
);

create table public.ai_usage_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  operation text not null check (char_length(operation) <= 60),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  status text not null check (status in ('ok', 'error', 'rejected')),
  error_code text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index ai_usage_ws_time_idx on public.ai_usage_events (workspace_id, created_at desc);
create index ai_usage_user_time_idx on public.ai_usage_events (user_id, created_at desc);

alter table public.content_items enable row level security;
alter table public.content_versions enable row level security;
alter table public.ai_usage_events enable row level security;

create policy "content: members read" on public.content_items
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "content: editors insert" on public.content_items
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']) and created_by = auth.uid());
create policy "content: editors update" on public.content_items
  for update to authenticated
  using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']))
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));
create policy "content: editors delete" on public.content_items
  for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']));

-- Versions are append-only: no update/delete policies (history cannot be rewritten).
create policy "versions: members read" on public.content_versions
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "versions: editors insert" on public.content_versions
  for insert to authenticated
  with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'agent']) and created_by = auth.uid());

-- Usage log is append-only for users, so quotas cannot be reset from the client.
create policy "usage: members read" on public.ai_usage_events
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "usage: self insert" on public.ai_usage_events
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and user_id = auth.uid());

-- Atomically appends a new version and moves the item pointer to it.
create or replace function public.add_content_version(
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
  values (p_item, v_ws, v_next, p_body, p_source, p_operation, coalesce(p_skills, '[]'::jsonb), p_quality, p_model, auth.uid());
  update public.content_items set current_version = v_next, updated_by = auth.uid() where id = p_item;
  return v_next;
end;
$$;

revoke all on function public.add_content_version(uuid, jsonb, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.add_content_version(uuid, jsonb, text, text, jsonb, jsonb, text) to authenticated;

-- Quota status for the current calendar month.
create or replace function public.ai_quota_status(p_ws uuid)
returns table (used integer, monthly_limit integer)
language sql
stable
set search_path = ''
as $$
  select
    (select count(*)::integer from public.ai_usage_events e
      where e.workspace_id = p_ws and e.status = 'ok'
        and e.operation in ('generate', 'refine', 'graphic_copy')
        and e.created_at >= date_trunc('month', now())),
    coalesce((select s.monthly_generation_limit from public.workspace_subscriptions s where s.workspace_id = p_ws), 0);
$$;

revoke all on function public.ai_quota_status(uuid) from public, anon;
grant execute on function public.ai_quota_status(uuid) to authenticated;
