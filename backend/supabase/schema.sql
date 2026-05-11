-- Supabase schema for Stellora smart flow

create extension if not exists "uuid-ossp";

create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  city text not null,
  trip_date date default current_date,
  window_start text default '08:00',
  window_end text default '20:00',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid references public.itineraries(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  city text not null,
  time_slot text,
  duration_minutes int,
  title text not null,
  location text not null,
  category text,
  status text default 'planned',
  note text,
  xid text,
  plan_date date default current_date,
  day_number int default 1,
  crowd_level text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.user_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  city text,
  lat double precision,
  lng double precision,
  source text check (source in ('live','manual')),
  updated_at timestamptz default now()
);

create table if not exists public.triparc_plans (
  id text primary key,
  destination text,
  days int,
  answers jsonb,
  locationPref jsonb,
  taste jsonb,
  created_at timestamptz default now()
);

create table if not exists public.translator_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  native_language text not null,
  target_language text not null,
  diet text,
  budget text,
  risk_tolerance text,
  social_comfort text,
  tone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.itineraries enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.user_locations enable row level security;
alter table public.translator_profiles enable row level security;
alter table public.triparc_plans enable row level security;

create policy "read own itineraries" on public.itineraries for select using (auth.uid() = user_id);
create policy "write own itineraries" on public.itineraries for insert with check (auth.uid() = user_id);
create policy "update own itineraries" on public.itineraries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read own items" on public.itinerary_items for select using (auth.uid() = user_id);
create policy "write own items" on public.itinerary_items for insert with check (auth.uid() = user_id);
create policy "update own items" on public.itinerary_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read own locations" on public.user_locations for select using (auth.uid() = user_id);
create policy "write own locations" on public.user_locations for insert with check (auth.uid() = user_id);
create policy "update own locations" on public.user_locations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read own translator profile" on public.translator_profiles for select using (auth.uid() = user_id);
create policy "write own translator profile" on public.translator_profiles for insert with check (auth.uid() = user_id);
create policy "update own translator profile" on public.translator_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read own plans" on public.triparc_plans for select using (auth.role() = 'service_role' or auth.uid()::text = id);
create policy "write own plans" on public.triparc_plans for insert with check (auth.role() = 'service_role' or auth.uid()::text = id);
