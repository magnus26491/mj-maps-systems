/**
 * Bridge & Restriction Engine
 *
 * Checks height, weight, and width restrictions on the route ahead.
 * Sources:
 *  1. OSM tags: maxheight, maxweight, maxwidth on way/node
 *  2. UK Highways England NTIS feed (closure + restriction events)
 *  3. Driver-reported corrections (stored in Redis)
 *
 * Alert fired when vehicle dimensions breach ANY upcoming restriction
 * within the next 2km of route.
 */

export interface VehicleDimensions {
  heightM:  number;
  weightT:  number; // tonnes GVW
  widthM:   number;
  lengthM:  number;
}

export interface RoadRestriction {
  type:        'height' | 'weight' | 'width' | 'length' | 'no_hgv' | 'no_motor_vehicles';
  valueM?:     number;   // metres — for height/width/length
  valueT?:     number;   // tonnes — for weight
  lat:         number;
  lng:         number;
  osmNodeId?:  string;
  osmWayId?:   string;
  source:      'osm' | 'ntis' | 'driver_report';
  reportedAt?: number;
}

export interface RestrictionAlert {
  breached:     boolean;
  restriction?: RoadRestriction;
  message?:     string;
  alertLevel:   'GREEN' | 'AMBER' | 'RED';
}

/**
 * Parse OSM maxheight tag value into metres.
 * Handles: "4.2", "4.2 m", "14'0\"", "imperial" notations.
 */
export function parseMaxHeight(raw: string): number | null {
  if (!raw) return null;
  const clean = raw.trim();

  // Decimal metres: "4.2" or "4.2 m"
  const metricMatch = clean.match(/^([\d.]+)\s*m?$/);
  if (metricMatch) return parseFloat(metricMatch[1]);

  // Feet and inches: 14'0" or 14'
  const imperialMatch = clean.match(/^(\d+)'\s*(\d+)?"?$/);
  if (imperialMatch) {
    const feet   = parseInt(imperialMatch[1], 10);
    const inches = parseInt(imperialMatch[2] ?? '0', 10);
    return parseFloat(((feet * 12 + inches) * 0.0254).toFixed(2));
  }

  return null;
}

/**
 * Parse OSM maxweight tag into tonnes.
 * Handles: "7.5", "7.5 t", "3.5 T"
 */
export function parseMaxWeight(raw: string): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^([\d.]+)\s*[tT]?$/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Check whether a vehicle breaches a single restriction.
 */
export function checkRestriction(
  vehicle: VehicleDimensions,
  restriction: RoadRestriction,
): RestrictionAlert {
  let breached = false;
  let message: string | undefined;

  switch (restriction.type) {
    case 'height':
      if (restriction.valueM !== undefined && vehicle.heightM > restriction.valueM) {
        breached = true;
        message = `Vehicle height ${vehicle.heightM}m exceeds ${restriction.valueM}m limit`;
      }
      break;
    case 'weight':
      if (restriction.valueT !== undefined && vehicle.weightT > restriction.valueT) {
        breached = true;
        message = `Vehicle weight ${vehicle.weightT}t exceeds ${restriction.valueT}t limit`;
      }
      break;
    case 'width':
      if (restriction.valueM !== undefined && vehicle.widthM > restriction.valueM) {
        breached = true;
        message = `Vehicle width ${vehicle.widthM}m exceeds ${restriction.valueM}m limit`;
      }
      break;
    case 'length':
      if (restriction.valueM !== undefined && vehicle.lengthM > restriction.valueM) {
        breached = true;
        message = `Vehicle length ${vehicle.lengthM}m exceeds ${restriction.valueM}m limit`;
      }
      break;
    case 'no_hgv':
      if (vehicle.weightT > 3.5) {
        breached = true;
        message = `No HGV restriction — vehicle over 3.5t`;
      }
      break;
    case 'no_motor_vehicles':
      breached = true;
      message  = `No motor vehicles permitted on this road`;
      break;
  }

  return {
    breached,
    restriction: breached ? restriction : undefined,
    message,
    alertLevel: breached ? 'RED' : 'GREEN',
  };
}

/**
 * Check a vehicle against a list of upcoming restrictions.
 * Returns the first RED breach found, or GREEN if all clear.
 */
export function checkUpcomingRestrictions(
  vehicle: VehicleDimensions,
  restrictions: RoadRestriction[],
): RestrictionAlert {
  for (const r of restrictions) {
    const result = checkRestriction(vehicle, r);
    if (result.breached) return result;
  }
  return { breached: false, alertLevel: 'GREEN' };
}
