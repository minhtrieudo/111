-- Create farms table for the farming game
CREATE TABLE IF NOT EXISTS farms (
  username TEXT PRIMARY KEY,
  pi_balance NUMERIC DEFAULT 10,
  stars INTEGER DEFAULT 0,
  plots JSONB DEFAULT '[]'::jsonb,
  inventory JSONB DEFAULT '[]'::jsonb,
  char_pos JSONB DEFAULT '{"x": 28, "y": 38}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS (Row Level Security)
ALTER TABLE farms ENABLE ROW LEVEL SECURITY;

-- Create policy for anonymous access (public read/write)
CREATE POLICY "Allow public insert on farms" ON farms
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow public update on farms" ON farms
  FOR UPDATE 
  WITH CHECK (true);

CREATE POLICY "Allow public select on farms" ON farms
  FOR SELECT 
  USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_farms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_farms_updated_at_trigger ON farms;
CREATE TRIGGER update_farms_updated_at_trigger
BEFORE UPDATE ON farms
FOR EACH ROW
EXECUTE FUNCTION update_farms_updated_at();
