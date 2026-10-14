-- OGARNIO ESTATE · migration 005 · Supabase Storage bucket + tenant policies.
-- Object keys are "<workspace_id>/<area>/<uuid>.<ext>"; the first path segment
-- decides tenancy. The block is skipped on PostgreSQL instances without the
-- Supabase storage schema (local test stack uses the filesystem driver).

do $migration$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not present, skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('workspace-files', 'workspace-files', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy "workspace files: members read" on storage.objects
      for select to authenticated
      using (bucket_id = 'workspace-files'
        and public.is_workspace_member(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy "workspace files: editors insert" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'workspace-files'
        and public.has_workspace_role(((storage.foldername(name))[1])::uuid, array['owner','admin','agent']))
  $p$;
  execute $p$
    create policy "workspace files: editors delete" on storage.objects
      for delete to authenticated
      using (bucket_id = 'workspace-files'
        and public.has_workspace_role(((storage.foldername(name))[1])::uuid, array['owner','admin','agent']))
  $p$;
end;
$migration$;
