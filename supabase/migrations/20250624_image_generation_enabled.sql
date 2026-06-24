-- Per-group image generation toggle (default off)
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS image_generation_enabled boolean NOT NULL DEFAULT false;

-- Refresh PostgREST schema cache (Supabase API)
NOTIFY pgrst, 'reload schema';
