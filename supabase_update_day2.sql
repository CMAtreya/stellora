-- Add day_number column to existing table
alter table public.itinerary_items 
add column if not exists day_number integer default 1;

-- If you are running the full reset, here is the updated create statement:
/*
create table public.itinerary_items (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid,
  city text not null,
  title text not null,
  location text,
  category text,
  time_slot text,
  duration_minutes integer,
  note text,
  status text default 'planned',
  xid text,
  plan_date date default CURRENT_DATE,
  day_number integer default 1 -- New column
);
*/
