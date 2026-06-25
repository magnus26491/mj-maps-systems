-- 022_postgis_and_spatial_indexes.sql
-- Stage 8: Enable PostGIS and add spatial indexes for performance.
--
-- ⚠️  PostGIS extension must be available in the DB cluster.
--     On Railway: add the postgres:15+ addon (PostGIS is bundled in v15).
--     On Supabase/Neon: run `CREATE EXTENSION postgis` in the SQL editor first.
--     On self-hosted Postgres: apt-get install postgresql-15-postgis-3
--
-- If PostGIS is NOT available, this migration will fail.
-- The migrate.js runner should catch and warn rather than halting deployment.

CREATE EXTENSION IF NOT EXISTS "postgis";

-- Spatial index on stops for ST_DWithin queries (nearby stop lookup)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename='stops' AND indexname='idx_stops_geom'
  ) THEN
    -- Add a generated geography column for spatial indexing
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
END
$$;

-- Spatial index on driver_locations for replay and heatmap queries
DO $$
BEGIN
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
END
$$;

-- Spatial index on geocode_pins for reverse-geocode nearest lookups
DO $$
BEGIN
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
END
$$;
