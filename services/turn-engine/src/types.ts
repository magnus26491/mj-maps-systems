/**
 * Turn Engine — Shared Types
 */

export interface LatLng {
  lat: number;
  lng: number;
}

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
}

export interface OsmRoadSegment {
  wayId: number;
  tags: OsmWayTags;
  nodes: number[];
  widthM: number | null;
  isDeadEnd: boolean;
  hasTurningHead: boolean;
  deadEndLengthM: number | null;
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

export interface TurnEngineResult {
  vehicleId: string;
  lat: number;
  lng: number;
  roadWidthM: number | null;
  hasTurningHead: boolean;
  deadEndLengthM: number | null;
  score: number;
  alertLevel: string;
  recommendation: string;
  alertDistanceM: number;
  canEnter: boolean;
  communityBlend: boolean;
  cached: boolean;
}
