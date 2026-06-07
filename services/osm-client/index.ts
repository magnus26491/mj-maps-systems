/**
 * OSM Client — public re-export shim
 * All consumers should use this import path.
 * Underlying implementation is in services/osm/overpass-client.ts
 */

export {
  runOverpassQuery,
  getRoadContext,
  getRoadContextBatch,
  checkOverpassHealth,
  OVERPASS_ENDPOINTS,
} from '../osm/overpass-client';
export type { OsmRoadContext } from '../osm/overpass-client';

export interface OsmWay {
  id: number;
  type: 'way';
  tags: Record<string, string>;
  nodes: number[];
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface OsmNode {
  id: number;
  type: 'node';
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export type OsmElement = OsmWay | OsmNode;
