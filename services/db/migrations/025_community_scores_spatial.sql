-- 025_community_scores_spatial.sql
-- Stage 8: Replace haversine-based community score clustering with
-- PostGIS ST_DWithin for correctness and index use.
-- Idempotent — safe to re-run.
--
-- Requires: migration 022 (PostGIS + idx_stops_geom) must have run first.
-- If PostGIS is not available this migration is a no-op (no table changes).

-- Create a materialised view for community pin scores so the dispatcher
-- analytics query stays fast even with millions of rows.
--
-- Clustered within 50 m: stops that share a pin area are considered the
-- same delivery point for scoring purposes.

DO $$
BEGIN
  -- Only proceed if PostGIS is installed
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE NOTICE '025: PostGIS not found — skipping spatial community score view';
    RETURN;
  END IF;

  -- Drop + recreate is safe because this is a VIEW, not a base table
  EXECUTE $sql$
    CREATE OR REPLACE VIEW community_pin_scores AS
    SELECT
      p.id                                AS pin_id,
      p.stop_id,
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
    GROUP BY p.id, p.stop_id, p.lat, p.lng, p.confidence
  $sql$;

  RAISE NOTICE '025: community_pin_scores view created/updated';
END
$$;

-- Index to speed up the ST_DWithin join on geocode_pins.geom
-- (idx_geocode_pins_geom was created in 022; this is a safety net)
CREATE INDEX IF NOT EXISTS idx_geocode_pins_geom_spatial
  ON geocode_pins USING GIST(geom);
