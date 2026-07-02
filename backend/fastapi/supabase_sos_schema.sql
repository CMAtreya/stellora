-- Supabase Schema for TripArc SOS Feature

-- 1. Emergency Contacts table
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    relationship TEXT,
    priority_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. SOS Events table
CREATE TABLE IF NOT EXISTS sos_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL, -- 'manual', 'voice', 'decibel'
    status TEXT DEFAULT 'active' NOT NULL, -- 'active', 'resolved'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE
);

-- 3. SOS Location Pings table
CREATE TABLE IF NOT EXISTS sos_location_pings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sos_event_id UUID REFERENCES sos_events(id) ON DELETE CASCADE NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. SOS Clips table
CREATE TABLE IF NOT EXISTS sos_clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sos_event_id UUID REFERENCES sos_events(id) ON DELETE CASCADE NOT NULL,
    clip_url TEXT NOT NULL,
    duration_seconds DOUBLE PRECISION DEFAULT 10.0 NOT NULL,
    uploaded BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create storage bucket for clips if it does not exist
-- Note: Supabase storage buckets must be managed via storage API or dashboard,
-- but you can run this in SQL Editor to register the bucket:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('sos-clips', 'sos-clips', true) ON CONFLICT DO NOTHING;
