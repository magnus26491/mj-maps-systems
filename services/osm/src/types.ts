/**
 * OSM Service — types
 */

export interface OverpassWay {
  id:   number;
  tags: Record<string, string>;
  nodes: number[];
}

export interface OverpassNode {
  id:  number;
  lat: number;
  lon: number;
}

export interface OverpassResponse {
  elements: Array<{ type: 'way' | 'node'; id: number; tags?: Record<string, string>; nodes?: number[]; lat?: number; lon?: number }>;
}
