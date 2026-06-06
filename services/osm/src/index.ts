/**
 * OSM Service — public export barrel
 *
 * getRoadGeometry is the single function consumed by the turn-engine resolver.
 * It abstracts over Overpass API + Redis cache + fallback heuristics.
 */
export { getRoadGeometry } from '../road-query';
export { enrichRoad } from '../road-enricher';
export { queryBuilding } from '../building-query';
export type { OverpassResponse, OverpassWay, OverpassNode } from './types';
