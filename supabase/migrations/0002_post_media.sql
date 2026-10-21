-- Image attachments for posts. Limits follow Meta's Threads docs (JPEG/PNG, 8 MB, 20 items max in a carousel).
-- Files live in a PRIVATE bucket; the Phase 2 publisher creates short-lived signed URLs for Meta to fetch.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 8388608, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png'];

-- Users can only touch objects inside a folder named after their own user id.
create policy post_media_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy post_media_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy post_media_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 8388608),
  width int not null check (width > 0),
  height int not null check (height > 0),
  position int not null check (position between 0 and 19),
  created_at timestamptz not null default now(),
  check (width::numeric / height between 0.01 and 10),
  check (storage_path like user_id::text || '/%')
);
create index post_media_post_idx on public.post_media (post_id, position);
create index post_media_user_idx on public.post_media (user_id);

alter table public.post_media enable row level security;

create policy post_media_select on public.post_media for select to authenticated using (user_id = (select auth.uid()));

-- Media can only be changed while the parent post is still editable by the user.
create policy post_media_insert on public.post_media for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()) and p.status in ('draft', 'scheduled', 'failed', 'cancelled'))
);
create policy post_media_update on public.post_media for update to authenticated
  using (user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()) and p.status in ('draft', 'scheduled', 'failed', 'cancelled')))
  with check (user_id = (select auth.uid()));
create policy post_media_delete on public.post_media for delete to authenticated using (
  user_id = (select auth.uid())
  and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()) and p.status in ('draft', 'scheduled', 'failed', 'cancelled'))
);

revoke all on public.post_media from anon, authenticated;
grant select on public.post_media to authenticated;
grant insert (post_id, user_id, storage_path, mime_type, size_bytes, width, height, position) on public.post_media to authenticated;
grant update (position) on public.post_media to authenticated;
grant delete on public.post_media to authenticated;
