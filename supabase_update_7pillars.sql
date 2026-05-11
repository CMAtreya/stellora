-- TripArc Seven Pillars persistence

create extension if not exists "pgcrypto";

create table if not exists public.triparc_seven_pillars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  engine_version text not null default '2.0',
  destination_network jsonb not null default '{"destinations": []}'::jsonb,
  active_day_cycle jsonb not null default '{"start": "08:00", "end": "21:00"}'::jsonb,
  investment_scope jsonb not null default '{"tier": "comfortable", "amount": 42500}'::jsonb,
  expedition_archetypes text[] not null default '{}',
  group_composition text not null default 'couple',
  dietary_preferences jsonb not null default '{"preferences": [], "allergies": ""}'::jsonb,
  special_interests text[] not null default '{}',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_triparc_seven_pillars_user on public.triparc_seven_pillars(user_id);

create or replace function public.touch_triparc_seven_pillars_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_triparc_seven_pillars_updated_at on public.triparc_seven_pillars;
create trigger trg_touch_triparc_seven_pillars_updated_at
before update on public.triparc_seven_pillars
for each row
execute procedure public.touch_triparc_seven_pillars_updated_at();

alter table public.triparc_seven_pillars enable row level security;

drop policy if exists "read own seven pillars" on public.triparc_seven_pillars;
create policy "read own seven pillars"
  on public.triparc_seven_pillars
  for select
  using (auth.uid() = user_id);

drop policy if exists "insert own seven pillars" on public.triparc_seven_pillars;
create policy "insert own seven pillars"
  on public.triparc_seven_pillars
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own seven pillars" on public.triparc_seven_pillars;
create policy "update own seven pillars"
  on public.triparc_seven_pillars
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own seven pillars" on public.triparc_seven_pillars;
create policy "delete own seven pillars"
  on public.triparc_seven_pillars
  for delete
  using (auth.uid() = user_id);
