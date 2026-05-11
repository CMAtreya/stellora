-- Add crowd_level column to itinerary_items table
alter table public.itinerary_items 
add column if not exists crowd_level text default 'medium'; -- 'low', 'medium', 'high', 'critical'

-- Updated Reset Script Reference:
/*
create table public.itinerary_items (
  ...
  day_number integer default 1,
  crowd_level text default 'medium'
);
*/
