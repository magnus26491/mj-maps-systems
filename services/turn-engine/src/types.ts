/**
 * Turn Engine — Shared Types
 * SINGLE SOURCE OF TRUTH for all turn-engine types.
 * All other services import from here.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export type AlertLevel = 'GREEN' | 'AMBER' | 'RED';
export type ClearanceConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface OsmWayTags {
  highway?: string;
  width?: string;
  maxwidth?: string;
  maxheight?: string;
  maxweight?: string;
  oneway?: string;
  access?: string;
  surface?: string;
  lanes?: string;
  name?: string;
  ref?: string;
  lit?: string;
  smoothness?: string;
  turning_circle?: string;
  turning_loop?: string;
  noexit?: string;
  dead_end?: string;
  junction?: string;
}

/** Raw OSM road segment returned by the OSM fetcher */
export interface OsmRoadSegment {
  wayId: number;
  tags: OsmWayTags;
  widthM: number;
  maxHeightM: number | null;
  maxWeightT: number | null;
  hasTurningHead: boolean;
  isDeadEnd: boolean;
  lengthToEndM: number;
  confidence: ClearanceConfidence;
  lastEdited: string | null;
}

/** Normalised road geometry used by the scorer */
export interface RoadGeometry {
  widthM: number | null;
  maxWidthM: number | null;
  maxHeightM: number | null;
  maxWeightT: number | null;
  highwayClass: string | null;
  isDeadEnd: boolean;
  isOneWay: boolean;
  hasTurningHead: boolean;
  hasPassingPlace: boolean;
  deadEndDepthM: number;
  source: 'osm' | 'fallback';
}

/** Vehicle profile constants used by the scorer */
export interface VehicleProfile {
  id: string;
  label: string;
  widthM: number;
  heightM: number;
  lengthM: number;
  weightT: number;
  minRoadWidthTurn: number;   // kerb-to-kerb required for forward U-turn
  minReverseDepthM: number;   // road depth needed to reverse out safely
}

/** Output of scoreTurn() */
export interface TurnScoreResult {
  score: number;              // 0.0 – 1.0
  alert: AlertLevel;
  reason: string | null;
  roadWidthM: number | null;
  source: 'osm' | 'fallback';
  cachedAt: number;           // Unix ms
}

/** Full result returned from resolveTurnScore() to the route-engine */
export interface TurnEngineResult extends TurnScoreResult {
  vehicleId: string;
  lat: number;
  lng: number;
  hasTurningHead: boolean;
  deadEndLengthM: number | null;
  alertDistanceM: number;
  canEnter: boolean;
  communityBlend: boolean;
  cached: boolean;
  /** The raw OSM segment used — consumed by approach-planner for oneway/tag info */
  segment: OsmRoadSegment | null;
}

export interface OverpassResponse {
  elements: Array<{
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    tags?: OsmWayTags;
    nodes?: number[];
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
}
