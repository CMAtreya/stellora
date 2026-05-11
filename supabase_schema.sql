create extension if not exists "uuid-ossp";

-- Core itinerary items used by TripArc and stories
create table public.itinerary_items (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users(id), -- Optional; backend may write with service role
  city text not null,
  title text not null,
  location text,
  category text,
  time_slot text,
  duration_minutes integer,
  note text,
  status text default 'planned',
  xid text,
  plan_date date default current_date,
  day_number integer default 1,
  crowd_level text
);

-- Planner metadata persisted from /api/triparc/plan
create table if not exists public.triparc_plans (
  id text primary key,
  destination text,
  days integer,
  answers jsonb,
  locationPref jsonb,
  taste jsonb,
  created_at timestamptz default now()
);

-- Live GPS locations captured by TripArc home
create table if not exists public.user_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  city text,
  lat double precision,
  lng double precision,
  source text check (source in ('live','manual')),
  updated_at timestamptz default now()
);

-- Translator profile preferences
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

-- Seven Pillars planning profile
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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table public.itinerary_items enable row level security;
alter table public.triparc_plans enable row level security;
alter table public.user_locations enable row level security;
alter table public.translator_profiles enable row level security;
alter table public.triparc_seven_pillars enable row level security;

-- Development-friendly open policy (replace with owner-scoped in prod)
create policy "Allow public access"
  on public.itinerary_items
  for all
  using (true)
  with check (true);

-- Owner-scoped policies for user-bound tables
create policy "read own plans" on public.triparc_plans for select using (auth.role() = 'service_role' or auth.uid()::text = id);
create policy "write own plans" on public.triparc_plans for insert with check (auth.role() = 'service_role' or auth.uid()::text = id);

create policy "read own locations" on public.user_locations for select using (auth.uid() = user_id);
create policy "write own locations" on public.user_locations for insert with check (auth.uid() = user_id);
create policy "update own locations" on public.user_locations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read own translator profile" on public.translator_profiles for select using (auth.uid() = user_id);
create policy "write own translator profile" on public.translator_profiles for insert with check (auth.uid() = user_id);
create policy "update own translator profile" on public.translator_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read own seven pillars" on public.triparc_seven_pillars for select using (auth.uid() = user_id);
create policy "insert own seven pillars" on public.triparc_seven_pillars for insert with check (auth.uid() = user_id);
create policy "update own seven pillars" on public.triparc_seven_pillars for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own seven pillars" on public.triparc_seven_pillars for delete using (auth.uid() = user_id);
