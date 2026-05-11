-- DROP table first to reset schema (WARNING: DELETES ALL DATA)
drop table if exists public.itinerary_items cascade;

-- Re-create the table with the correct columns needed by the app
create table public.itinerary_items (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid, -- Optional link to auth.users
  city text not null,
  title text not null,
  location text,
  category text,
  time_slot text, -- "09:00 - 10:30"
  duration_minutes integer,
  note text,
  status text default 'planned',
  xid text, -- Critical: Google Place ID
  plan_date date default CURRENT_DATE
);

-- Enable RLS
alter table public.itinerary_items enable row level security;

-- Allow public access (Dev Mode)
create policy "Allow public access"
  on public.itinerary_items
  for all
  using (true)
  with check (true);
