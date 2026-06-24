-- user_profiles must be unique per (group_id, wa_user_id), not globally per wa_user_id.
-- Same WhatsApp participant can have one profile row in each group they belong to.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'user_profiles'
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY u.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
      ) = ARRAY['wa_user_id']::name[]
  LOOP
    EXECUTE format('ALTER TABLE user_profiles DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'user_profiles'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) LIKE '%(group_id, wa_user_id)%'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_group_id_wa_user_id_key UNIQUE (group_id, wa_user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
