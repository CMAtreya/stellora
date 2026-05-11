-- Create user_recommendations table to store personalized recommendations for each user
CREATE TABLE IF NOT EXISTS public.user_recommendations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destinations TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  archetypes TEXT[] DEFAULT '{}',
  recommendations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_user_recommendations UNIQUE(user_id)
);

-- Create index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_user_recommendations_user_id 
  ON public.user_recommendations(user_id);

-- Create index for faster searches by interests
CREATE INDEX IF NOT EXISTS idx_user_recommendations_interests 
  ON public.user_recommendations USING GIN(interests);

-- Create index for faster searches by archetypes
CREATE INDEX IF NOT EXISTS idx_user_recommendations_archetypes 
  ON public.user_recommendations USING GIN(archetypes);

-- Create index for faster searches by destinations
CREATE INDEX IF NOT EXISTS idx_user_recommendations_destinations 
  ON public.user_recommendations USING GIN(destinations);

-- Enable RLS for user_recommendations table
ALTER TABLE public.user_recommendations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: Users can only view their own recommendations
CREATE POLICY "Users can view own recommendations" 
  ON public.user_recommendations 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Create RLS policy: Users can insert their own recommendations
CREATE POLICY "Users can insert own recommendations" 
  ON public.user_recommendations 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Create RLS policy: Users can update their own recommendations
CREATE POLICY "Users can update own recommendations" 
  ON public.user_recommendations 
  FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create RLS policy: Users can delete their own recommendations
CREATE POLICY "Users can delete own recommendations" 
  ON public.user_recommendations 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_recommendations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_recommendations_updated_at_trigger
BEFORE UPDATE ON public.user_recommendations
FOR EACH ROW
EXECUTE FUNCTION update_user_recommendations_timestamp();

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_recommendations TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE user_recommendations_id_seq TO authenticated;
