-- 016_fix_driver_locations_pk.sql
-- Converts driver_locations PK from single-col (driver_id) to composite
-- (driver_id, recorded_at) so location.ts can INSERT full GPS history.
-- Already-migrated databases still have the old single-col PK — this fixes it.
-- Idempotent.


DO $$
BEGIN
  -- Only act if the old single-column PK still exists (recorded_at not in it)
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conname = 'driver_locations_pkey'
      AND c.contype = 'p'
      AND c.conrelid = 'driver_locations'::regclass
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY(c.conkey)
    WHERE c.conname = 'driver_locations_pkey'
      AND c.conrelid = 'driver_locations'::regclass
      AND a.attname = 'recorded_at'
  ) THEN
    ALTER TABLE driver_locations DROP CONSTRAINT driver_locations_pkey;
    ALTER TABLE driver_locations ADD PRIMARY KEY (driver_id, recorded_at);
  END IF;
END $$;