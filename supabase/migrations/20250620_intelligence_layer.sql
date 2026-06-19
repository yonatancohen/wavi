-- Intelligence layer schema updates
-- Run against existing Supabase instances created from the pre-intelligence schema.

ALTER TABLE relationship_map
  ADD COLUMN IF NOT EXISTS user_a_name text,
  ADD COLUMN IF NOT EXISTS user_b_name text;

-- Canonical pair ordering: user_a_wa_id must be lexicographically less than user_b_wa_id.
-- Skip if constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'relationship_pair_order'
  ) THEN
    ALTER TABLE relationship_map
      ADD CONSTRAINT relationship_pair_order CHECK (user_a_wa_id < user_b_wa_id);
  END IF;
END $$;
