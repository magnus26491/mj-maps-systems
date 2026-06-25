-- 022_postgis_and_spatial_indexes.sql
-- Stage 8: Enable PostGIS and add spatial indexes for performance.
--
-- ⚠️  PostGIS extension must be available in the DB cluster.
--     On Railway: enable the PostGIS add-on in your project settings.
--     On Supabase/Neon: run `CREATE EXTENSION postgis` in the SQL editor first.
--     On self-hosted Postgres: apt-get install postgresql-15-postgis-3
--
-- If PostGIS is NOT available this migration applies as a no-op (warning logged).
-- The spatial columns and GIST indexes are a performance optimisation only;
-- the app functions without them using plain lat/lng B-tree indexes.

DO $$
BEGIN
  -- Install extension (no-op if already present)
  CREATE EXTENSION IF NOT EXISTS postgis;

  -- Spatial index on stops for ST_DWithin queries (nearby stop lookup)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename='stops' AND indexname='idx_stops_geom'
  ) THEN
    ALTER TABLE stops
      ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
      GENERATED ALWAYS AS (
        CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
             THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
             ELSE NULL
        END
      ) STORED;
    CREATE INDEX idx_stops_geom ON stops USING GIST(geom);
  END IF;

  -- Spatial index on driver_locations for replay and heatmap queries
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename='driver_locations' AND indexname='idx_driver_locations_geom'
  ) THEN
    ALTER TABLE driver_locations
      ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
      GENERATED ALWAYS AS (
        CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
             THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
             ELSE NULL
        END
      ) STORED;
    CREATE INDEX idx_driver_locations_geom ON driver_locations USING GIST(geom);
  END IF;

  -- Spatial index on geocode_pins for reverse-geocode nearest lookups
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename='geocode_pins' AND indexname='idx_geocode_pins_geom'
  ) THEN
    ALTER TABLE geocode_pins
      ADD COLUMN IF NOT EXISTS geom geography(Point, 4326)
      GENERATED ALWAYS AS (
        CASE WHEN lat IS NOT NULL AND lng IS NOT NULL
             THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
             ELSE NULL
        END
      ) STORED;
    CREATE INDEX idx_geocode_pins_geom ON geocode_pins USING GIST(geom);
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING
    'PostGIS not available — spatial columns and GIST indexes skipped. '
    'Install PostGIS to enable ST_DWithin geographic queries. Error: %', SQLERRM;
END $$;
