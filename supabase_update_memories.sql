-- TripArc Memories persistence
-- Run in Supabase SQL editor after base schema.

create extension if not exists "pgcrypto";

create table if not exists public.memories_albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  location text not null,
  is_public boolean not null default false,
  start_date date,
  end_date date,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memories_albums
  add column if not exists is_public boolean not null default false;

create table if not exists public.triparc_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  username text unique,
  bio text,
  home_base text,
  avatar_url text,
  is_profile_public boolean not null default true,
  share_private_albums boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memories_media (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.memories_albums(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  media_url text not null,
  storage_path text not null,
  width integer,
  height integer,
  caption text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_memories_albums_user_created on public.memories_albums(user_id, created_at desc);
create index if not exists idx_memories_media_album_created on public.memories_media(album_id, created_at desc);
create index if not exists idx_memories_media_user_created on public.memories_media(user_id, created_at desc);
create index if not exists idx_memories_albums_public_lookup on public.memories_albums(user_id, is_public, created_at desc);
create index if not exists idx_triparc_public_profiles_public on public.triparc_public_profiles(is_profile_public);

alter table public.memories_albums enable row level security;
alter table public.memories_media enable row level security;
alter table public.triparc_public_profiles enable row level security;

drop policy if exists "read own albums" on public.memories_albums;
drop policy if exists "read own or public albums" on public.memories_albums;
create policy "read own or public albums"
  on public.memories_albums
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.triparc_public_profiles p
      where p.user_id = memories_albums.user_id
        and p.is_profile_public = true
        and (memories_albums.is_public = true or p.share_private_albums = true)
    )
  );

drop policy if exists "insert own albums" on public.memories_albums;
create policy "insert own albums"
  on public.memories_albums
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own albums" on public.memories_albums;
create policy "update own albums"
  on public.memories_albums
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own albums" on public.memories_albums;
create policy "delete own albums"
  on public.memories_albums
  for delete
  using (auth.uid() = user_id);

drop policy if exists "read public profiles" on public.triparc_public_profiles;
create policy "read public profiles"
  on public.triparc_public_profiles
  for select
  using (is_profile_public = true or auth.uid() = user_id);

drop policy if exists "insert own public profile" on public.triparc_public_profiles;
create policy "insert own public profile"
  on public.triparc_public_profiles
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own public profile" on public.triparc_public_profiles;
create policy "update own public profile"
  on public.triparc_public_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own public profile" on public.triparc_public_profiles;
create policy "delete own public profile"
  on public.triparc_public_profiles
  for delete
  using (auth.uid() = user_id);

drop policy if exists "read own media" on public.memories_media;
create policy "read own media"
  on public.memories_media
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own media" on public.memories_media;
create policy "insert own media"
  on public.memories_media
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.memories_albums a
      where a.id = album_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "update own media" on public.memories_media;
create policy "update own media"
  on public.memories_media
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own media" on public.memories_media;
create policy "delete own media"
  on public.memories_media
  for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('triparc-memories', 'triparc-memories', true)
on conflict (id) do nothing;

drop policy if exists "memories storage read" on storage.objects;
create policy "memories storage read"
  on storage.objects
  for select
  using (bucket_id = 'triparc-memories' and auth.uid()::text = split_part(name, '/', 1));

drop policy if exists "memories storage insert" on storage.objects;
create policy "memories storage insert"
  on storage.objects
  for insert
  with check (bucket_id = 'triparc-memories' and auth.uid()::text = split_part(name, '/', 1));

drop policy if exists "memories storage update" on storage.objects;
create policy "memories storage update"
  on storage.objects
  for update
  using (bucket_id = 'triparc-memories' and auth.uid()::text = split_part(name, '/', 1))
  with check (bucket_id = 'triparc-memories' and auth.uid()::text = split_part(name, '/', 1));

drop policy if exists "memories storage delete" on storage.objects;
create policy "memories storage delete"
  on storage.objects
  for delete
  using (bucket_id = 'triparc-memories' and auth.uid()::text = split_part(name, '/', 1));

insert into storage.buckets (id, name, public)
values ('triparc-profiles', 'triparc-profiles', true)
on conflict (id) do nothing;

drop policy if exists "profiles storage read" on storage.objects;
create policy "profiles storage read"
  on storage.objects
  for select
  using (bucket_id = 'triparc-profiles');

drop policy if exists "profiles storage insert" on storage.objects;
create policy "profiles storage insert"
  on storage.objects
  for insert
  with check (bucket_id = 'triparc-profiles' and auth.uid()::text = split_part(name, '/', 1));

drop policy if exists "profiles storage update" on storage.objects;
create policy "profiles storage update"
  on storage.objects
  for update
  using (bucket_id = 'triparc-profiles' and auth.uid()::text = split_part(name, '/', 1))
  with check (bucket_id = 'triparc-profiles' and auth.uid()::text = split_part(name, '/', 1));

drop policy if exists "profiles storage delete" on storage.objects;
create policy "profiles storage delete"
  on storage.objects
  for delete
  using (bucket_id = 'triparc-profiles' and auth.uid()::text = split_part(name, '/', 1));
