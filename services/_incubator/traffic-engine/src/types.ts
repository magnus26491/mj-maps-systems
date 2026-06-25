/**
 * Traffic Engine — types
 *
 * Provides live traffic conditions and ETA recalculation mid-shift.
 * Used by dynamic-replan.ts to update stop ETAs when:
 *   · Traffic incident detected on route
 *   · Driver is running ahead or behind schedule
 *   · Stop takes longer than expected (dwell time overrun)
 *
 * Data sources:
 *   Primary:  TomTom Traffic API (real-time flow + incidents)
 *   Fallback: HERE Traffic API
 *   Offline:  Historical speed profiles by road class + time of day
 */

export type TrafficSeverity = 'CLEAR' | 'LIGHT' | 'MODERATE' | 'HEAVY' | 'STANDSTILL';

export interface TrafficSegment {
  /** Start lat/lng of segment */
  fromLat:          number;
  fromLng:          number;
  /** End lat/lng of segment */
  toLat:            number;
  toLng:            number;
  /** Current speed in km/h */
  currentSpeedKph:  number;
  /** Free-flow speed in km/h (no traffic) */
  freeFlowSpeedKph: number;
  /** Congestion ratio: currentSpeed / freeFlowSpeed. 1.0 = clear */
  congestionRatio:  number;
  severity:         TrafficSeverity;
  /** Estimated delay vs free-flow in seconds */
  delaySeconds:     number;
  fetchedAt:        number;
}

export interface TrafficIncident {
  id:          string;
  lat:         number;
  lng:         number;
  type:        'accident' | 'roadwork' | 'closure' | 'hazard' | 'congestion';
  severity:    TrafficSeverity;
  description: string;
  /** Estimated clearance time (Unix ms). null = unknown */
  clearsAt:    number | null;
  affectedRoads: string[];
}

export interface EtaRecalcResult {
  stopId:          string;
  originalEta:     number; // Unix ms
  revisedEta:      number; // Unix ms
  deltaSeconds:    number; // positive = running late, negative = running early
  reason:          string | null;
  confidence:      'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ShiftTrafficUpdate {
  routeId:     string;
  updatedAt:   number;
  etaUpdates:  EtaRecalcResult[];
  incidents:   TrafficIncident[];
  overallDelaySecs: number;
}
