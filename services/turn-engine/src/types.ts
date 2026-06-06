/**
 * Turn Engine — shared types
 *
 * RoadGeometry is the normalised output from the OSM service.
 * TurnScoreResult is what the turn engine returns to the API and driver app.
 */

export type AlertLevel = 'GREEN' | 'AMBER' | 'RED';

export interface RoadGeometry {
  /** Nearest OSM way ID */
  wayId:            number | null;
  /** Road width kerb-to-kerb in metres. null = unknown */
  widthM:           number | null;
  /** OSM highway classification */
  highwayClass:     string | null;
  /** Number of lanes (total, both directions) */
  lanes:            number | null;
  /** True if OSM tags indicate a turning head / turning circle nearby */
  hasTurningHead:   boolean;
  /** True if OSM tags indicate a passing place */
  hasPassingPlace:  boolean;
  /** True if one-way restriction applies */
  isOneWay:         boolean;
  /** True if road is a dead-end (no exit other than reversing) */
  isDeadEnd:        boolean;
  /** Dead-end pocket depth in metres (0 if not dead end) */
  deadEndDepthM:    number;
  /** Max vehicle width restriction from OSM maxwidth tag (metres) */
  maxWidthM:        number | null;
  /** Max vehicle height restriction from OSM maxheight tag (metres) */
  maxHeightM:       number | null;
  /** Max vehicle weight restriction from OSM maxweight tag (tonnes) */
  maxWeightT:       number | null;
  /** Data source: overpass | cache | fallback | mock */
  source:           'overpass' | 'cache' | 'fallback' | 'mock';
  /** Unix ms timestamp of when data was fetched */
  fetchedAt:        number;
}

export interface TurnScoreResult {
  /** 0.0–1.0. Higher = more feasible for this vehicle to turn. */
  score:      number;
  alert:      AlertLevel;
  /** Human-readable reason for AMBER or RED alerts */
  reason:     string | null;
  roadWidthM: number | null;
  source:     RoadGeometry['source'];
  cachedAt:   number;
}

export interface VehicleProfile {
  id:                string;
  label:             string;
  lengthM:           number;
  widthM:            number;
  heightM:           number;
  weightT:           number;
  /** Minimum road width (kerb-to-kerb) needed to execute a forward turn */
  minRoadWidthTurn:  number;
  /** Full lock turning circle diameter */
  turningCircleM:    number;
  /** Minimum straight dead-end depth to reverse safely */
  minReverseDepthM:  number;
}
