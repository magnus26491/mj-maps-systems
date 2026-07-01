/**
 * Bridge Engine — types
 *
 * Checks height, weight, and width restrictions on ALL road segments
 * between stops — not just at the stop itself.
 *
 * Prevents a 7.5t HGV being routed under a 3.0m railway bridge,
 * or a Luton van through a 2.1m car park barrier.
 *
 * Data sources:
 *   · OSM maxheight / maxweight / maxwidth tags on ways
 *   · OS OpenData hazard features
 *   · Driver-reported restrictions (stored in PostgreSQL)
 *
 * Restriction types:
 *   BRIDGE   — vertical clearance (maxheight)
 *   WEIGHT   — load limit (maxweight / maxaxleload)
 *   WIDTH    — horizontal clearance (maxwidth)
 *   BARRIER  — car park height barriers, bollards, gates
 *   PRIVATE  — private road / no HGV access
 */

export type RestrictionType = 'BRIDGE' | 'WEIGHT' | 'WIDTH' | 'BARRIER' | 'PRIVATE';
export type RestrictionSeverity = 'BLOCKED' | 'WARNING' | 'INFO';

export interface RoadRestriction {
  wayId:       number;
  lat:         number;
  lng:         number;
  type:        RestrictionType;
  severity:    RestrictionSeverity;
  /** Restriction value (metres for height/width, tonnes for weight) */
  value:       number | null;
  description: string;
  /** Whether a driver has confirmed this restriction exists */
  driverVerified: boolean;
  source:      'osm' | 'os_opendata' | 'driver_reported';
  /** OSM layer of this restriction's way — 0=ground, 1+=elevated, −1=below */
  layer:       number;
}

export interface RouteSegment {
  fromLat: number;
  fromLng: number;
  toLat:   number;
  toLng:   number;
}

export interface RestrictionCheckResult {
  /** Whether the route is clear for this vehicle */
  clear:        boolean;
  blockers:     RoadRestriction[]; // BLOCKED severity restrictions
  warnings:     RoadRestriction[]; // WARNING severity restrictions
  /** Suggested alternative approach if blocked */
  alternativeHint: string | null;
}
