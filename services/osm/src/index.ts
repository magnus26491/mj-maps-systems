/**
 * OSM service entry point
 * Re-exports everything consumers need from one place.
 */
export { runOverpassQuery, getRoadContext, getRoadContextBatch, checkOverpassHealth } from '../overpass-client';
export type { OsmRoadContext } from '../overpass-client';
export { enrichRoute } from '../road-enricher';
export type { EnrichedRoute, EnrichedStop } from '../road-enricher';
