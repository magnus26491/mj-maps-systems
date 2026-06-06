/**
 * Road Closure Engine
 *
 * Ingests live road closure and disruption data and flags upcoming
 * closures on the driver's route before they reach them.
 *
 * Data sources:
 *  1. Highways England NTIS (National Traffic Information Service) — DATEX II
 *  2. TfL Disruptions API (London)
 *  3. OSM note + highway=construction tags
 *  4. Driver reports (community layer)
 *
 * Closure types handled:
 *  · Full road closure (rerouteable)
 *  · Contraflow (speed/lane restriction)
 *  · Traffic lights (adds time penalty)
 *  · Roadworks (temporary width restriction)
 *  · Emergency incident (severity-graded)
 */

export type ClosureType =
  | 'full_closure'
  | 'contraflow'
  | 'traffic_lights'
  | 'roadworks'
  | 'emergency'
  | 'planned_event';

export type ClosureSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RoadClosure {
  id:           string;
  type:         ClosureType;
  severity:     ClosureSeverity;
  lat:          number;
  lng:          number;
  radiusM:      number;       // Affected radius
  description:  string;
  startMs:      number;       // Unix ms
  endMs:        number | null; // null = indefinite
  source:       'highways_england' | 'tfl' | 'osm' | 'driver_report';
  detourAvailable: boolean;
  timePenaltyMins: number;    // Estimated delay if not closed (e.g. traffic lights)
}

export interface ClosureAlert {
  closure:       RoadClosure;
  affectsRoute:  boolean;
  distanceAhead: number;     // metres from current position
  message:       string;
  alertLevel:    'AMBER' | 'RED';
}

/**
 * Check if a closure is currently active.
 */
export function isClosureActive(closure: RoadClosure, nowMs = Date.now()): boolean {
  if (nowMs < closure.startMs) return false;
  if (closure.endMs !== null && nowMs > closure.endMs) return false;
  return true;
}

/**
 * Calculate severity-based alert level.
 */
export function closureAlertLevel(closure: RoadClosure): 'AMBER' | 'RED' {
  if (closure.type === 'full_closure' || closure.severity === 'critical' || closure.severity === 'high') {
    return 'RED';
  }
  return 'AMBER';
}

/**
 * Haversine distance (metres) — inline to avoid cross-service import.
 */
function distMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6_371_000;
  const d1 = (lat2 - lat1) * Math.PI / 180;
  const d2 = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(d1/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(d2/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * Filter active closures that are within alertRadiusM of the vehicle's current position.
 */
export function getActiveClosuresAhead(
  closures: RoadClosure[],
  vehicleLat: number,
  vehicleLng: number,
  alertRadiusM = 2000,
  nowMs = Date.now(),
): ClosureAlert[] {
  return closures
    .filter(c => isClosureActive(c, nowMs))
    .map(c => ({
      closure:       c,
      affectsRoute:  true,
      distanceAhead: distMetres(vehicleLat, vehicleLng, c.lat, c.lng),
      message:       buildClosureMessage(c),
      alertLevel:    closureAlertLevel(c),
    }))
    .filter(a => a.distanceAhead <= alertRadiusM + c.radiusM)
    .sort((a, b) => a.distanceAhead - b.distanceAhead);
}

function buildClosureMessage(c: RoadClosure): string {
  const typeLabel: Record<ClosureType, string> = {
    full_closure:   'Road closed',
    contraflow:     'Contraflow ahead',
    traffic_lights: 'Temporary traffic lights',
    roadworks:      'Roadworks',
    emergency:      'Emergency incident',
    planned_event:  'Planned event',
  };
  const label = typeLabel[c.type] ?? 'Disruption';
  return c.timePenaltyMins > 0
    ? `${label}: ~${c.timePenaltyMins} min delay — ${c.description}`
    : `${label} — ${c.description}`;
}
