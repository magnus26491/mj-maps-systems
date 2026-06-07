/**
 * Turn Engine — public API
 */
export { resolveTurnScore } from './resolver';
export { scoreTurn } from './scorer';
export type {
  TurnScoreResult,
  TurnEngineResult,
  RoadGeometry,
  VehicleProfile,
  AlertLevel,
  ClearanceConfidence,
  OsmRoadSegment,
  OsmWayTags,
  LatLng,
  OverpassResponse,
} from './types';
