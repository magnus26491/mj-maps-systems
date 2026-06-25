-- 025_community_scores_spatial.sql
-- Stage 8: Replace haversine-based community score clustering with
-- PostGIS ST_DWithin for correctness and index use.
-- Idempotent — safe to re-run.
--
-- Requires: migration 022 (PostGIS + idx_geocode_pins_geom) must have run first.
-- If PostGIS is not available this migration is a no-op (no table changes).

DO $$
BEGIN
  -- Only proceed if PostGIS is installed
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE NOTICE '025: PostGIS not found — skipping spatial community score view';
    RETURN;
  END IF;

  -- geom column must exist (added by 022) — double-check
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'geocode_pins' AND column_name = 'geom'
  ) THEN
    RAISE NOTICE '025: geocode_pins.geom column not found — skipping (run 022 with PostGIS first)';
    RETURN;
  END IF;

  -- Drop + recreate is safe because this is a VIEW, not a base table.
  -- Note: geocode_pins has no stop_id column; joins happen via stops.geocode_pin_id.
  EXECUTE $sql$
    CREATE OR REPLACE VIEW community_pin_scores AS
    SELECT
      p.id                                AS pin_id,
      p.lat,
      p.lng,
      p.confidence,
      COUNT(neighbour.id)                 AS nearby_pin_count,
      AVG(neighbour.confidence)           AS avg_area_confidence
    FROM geocode_pins p
    LEFT JOIN geocode_pins neighbour
           ON neighbour.id != p.id
          AND ST_DWithin(
                p.geom::geography,
                neighbour.geom::geography,
                50           -- 50 metre cluster radius
              )
    GROUP BY p.id, p.lat, p.lng, p.confidence
  $sql$;

  RAISE NOTICE '025: community_pin_scores view created/updated';

  -- Safety-net index (idx_geocode_pins_geom was created in 022)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'geocode_pins' AND indexname = 'idx_geocode_pins_geom_spatial'
  ) THEN
    EXECUTE 'CREATE INDEX idx_geocode_pins_geom_spatial ON geocode_pins USING GIST(geom)';
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '025: spatial view/index skipped: %', SQLERRM;
END $$;
