-- Lost & Found group coordination schema patch
-- Purpose:
-- 1) Ensure PostgREST endpoints exist for public.groups and public.group_members (fix 404)
-- 2) Support upsert via on_conflict=group_id,user_id
-- 3) Enable realtime streaming for both tables
--
-- NOTE: This patch uses permissive RLS policies for quick integration.
-- Tighten these policies before production launch.

create extension if not exists "pgcrypto";

-- 1) groups table
create table if not exists public.groups (
  id text primary key,
  group_code text not null unique,
  name text not null default 'Trip Group',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.groups
  add column if not exists id text,
  add column if not exists group_code text,
  add column if not exists name text,
  add column if not exists created_by text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- 2) group_members table
create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  user_id text not null,
  display_name text,
  live_lat double precision,
  live_lng double precision,
  accuracy double precision,
  is_lost boolean not null default false,
  last_updated timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.group_members
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists group_id text,
  add column if not exists user_id text,
  add column if not exists display_name text,
  add column if not exists live_lat double precision,
  add column if not exists live_lng double precision,
  add column if not exists accuracy double precision,
  add column if not exists is_lost boolean default false,
  add column if not exists last_updated timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Ensure PK exists for older pre-existing tables.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.group_members'::regclass
      and contype = 'p'
  ) then
    alter table public.group_members add primary key (id);
  end if;
end $$;

-- Critical constraint for backend upsert:
-- POST /rest/v1/group_members?on_conflict=group_id,user_id
create unique index if not exists uq_group_members_group_user
  on public.group_members(group_id, user_id);

create index if not exists idx_group_members_group_id on public.group_members(group_id);
create index if not exists idx_group_members_last_updated on public.group_members(last_updated desc);

-- Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_groups_touch_updated_at on public.groups;
create trigger trg_groups_touch_updated_at
before update on public.groups
for each row execute function public.touch_updated_at();

drop trigger if exists trg_group_members_touch_updated_at on public.group_members;
create trigger trg_group_members_touch_updated_at
before update on public.group_members
for each row execute function public.touch_updated_at();

-- RLS + permissive policies for immediate integration
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.groups to anon, authenticated, service_role;
grant select, insert, update, delete on public.group_members to anon, authenticated, service_role;

drop policy if exists "groups read all" on public.groups;
create policy "groups read all"
  on public.groups
  for select
  using (true);

drop policy if exists "groups write all" on public.groups;
create policy "groups write all"
  on public.groups
  for all
  using (true)
  with check (true);

drop policy if exists "group_members read all" on public.group_members;
create policy "group_members read all"
  on public.group_members
  for select
  using (true);

drop policy if exists "group_members write all" on public.group_members;
create policy "group_members write all"
  on public.group_members
  for all
  using (true)
  with check (true);

-- Realtime publication
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table public.groups;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
end $$;

-- Force PostgREST to reload schema cache so new tables appear at /rest/v1/* immediately.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception when others then
  null;
end $$;
