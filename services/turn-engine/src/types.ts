/**
 * MJ Maps Systems — Turn Engine
 * Shared types for the OSM road data pipeline and turn score resolver
 */

import type { TurnAlert, ClearanceConfidence } from '../../../packages/vehicle-profiles/index';

export interface LatLng {
  lat: number;
  lng: number;
}

// ─── OSM RAW DATA ────────────────────────────────────────────────────────────

/** Raw tag set returned by the Overpass API for a way element */
export interface OsmWayTags {
  /** e.g. 'residential' | 'service' | 'unclassified' | 'primary' etc. */
  highway?: string;
  /** e.g. '4.5' | '4.5 m' | '15 ft' — raw string from OSM */
  maxwidth?: string;
  /** e.g. '3.5' | '3.5 m' | '11 ft 6 in' */
  maxheight?: string;
  /** e.g. '7.5' — max weight in tonnes */
  maxweight?: string;
  /** 'yes' | 'no' | 'turning_circle' | 'turning_loop' */
  turning_circle?: string;
  noexit?: string;
  oneway?: string;
  access?: string;
  surface?: string;
  lanes?: string;
  width?: string;
  [key: string]: string | undefined;
}

/** Parsed and normalised road geometry from OSM */
export interface OsmRoadSegment {
  osmWayId: number;
  tags: OsmWayTags;
  /** Parsed kerb-to-kerb width in metres, null if not present in OSM */
  widthM: number | null;
  /** Parsed max height restriction in metres, null if none */
  maxHeightM: number | null;
  /** Parsed max weight restriction in tonnes, null if none */
  maxWeightT: number | null;
  /** Whether OSM tags indicate a turning head / circle / loop at end */
  hasTurningHead: boolean;
  /** Whether OSM tags indicate a dead end / no exit */
  isDeadEnd: boolean;
  /** Estimated road length from query point to end of way (metres) */
  lengthToEndM: number;
  /** Confidence level based on tag source */
  confidence: ClearanceConfidence;
  /** ISO timestamp of last OSM edit for this way */
  lastEdited: string | null;
}

// ─── TURN ENGINE RESULT ──────────────────────────────────────────────────────

export interface TurnEngineResult {
  vehicleProfileId: string;
  location: LatLng;
  /** The road segment used for scoring (nearest match) */
  segment: OsmRoadSegment;
  score: number;
  alert: TurnAlert;
  /** Metres before the stop at which the driver should be warned */
  alertDistanceM: number;
  /** Human-readable reason string for the HUD */
  reason: string;
  /** Whether this result came from the Redis cache */
  fromCache: boolean;
  /** ISO timestamp when this result was computed */
  computedAt: string;
}

// ─── OSM OVERPASS RESPONSE ───────────────────────────────────────────────────

export interface OverpassElement {
  type: 'way' | 'node' | 'relation';
  id: number;
  tags?: OsmWayTags;
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}
