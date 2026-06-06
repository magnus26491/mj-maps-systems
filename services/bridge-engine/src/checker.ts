/**
 * Bridge Engine — restriction checker
 *
 * Given a vehicle profile and a list of road restrictions on a route segment,
 * returns whether the vehicle can pass and any warnings.
 *
 * Called at route-planning time (before shift starts) for every inter-stop segment.
 * Also called reactively when a new restriction is detected mid-shift.
 */
import type { RoadRestriction, RestrictionCheckResult, RestrictionSeverity } from './types';
import type { VehicleProfile } from '../../turn-engine/src/types';

function severity(restriction: RoadRestriction, vehicle: VehicleProfile): RestrictionSeverity {
  if (restriction.value === null) return 'WARNING'; // unknown — caution

  switch (restriction.type) {
    case 'BRIDGE':
    case 'BARRIER':
      return restriction.value < vehicle.heightM ? 'BLOCKED' : 'INFO';

    case 'WEIGHT':
      return restriction.value < vehicle.weightT ? 'BLOCKED' : 'INFO';

    case 'WIDTH':
      return restriction.value < vehicle.widthM ? 'BLOCKED' : 'INFO';

    case 'PRIVATE':
      // Private roads are always a WARNING — driver may have access
      return 'WARNING';

    default:
      return 'INFO';
  }
}

export function checkRestrictions(
  restrictions: RoadRestriction[],
  vehicle: VehicleProfile,
): RestrictionCheckResult {
  const evaluated = restrictions.map(r => ({
    ...r,
    severity: severity(r, vehicle),
  }));

  const blockers  = evaluated.filter(r => r.severity === 'BLOCKED');
  const warnings  = evaluated.filter(r => r.severity === 'WARNING');

  let alternativeHint: string | null = null;
  if (blockers.length > 0) {
    const first = blockers[0];
    switch (first.type) {
      case 'BRIDGE':
        alternativeHint = `Bridge height restriction (${first.value}m) — find alternative route avoiding this bridge`;
        break;
      case 'WEIGHT':
        alternativeHint = `Weight restriction (${first.value}t) — use designated HGV route`;
        break;
      case 'WIDTH':
        alternativeHint = `Width restriction (${first.value}m) — use wider alternative road`;
        break;
      default:
        alternativeHint = 'Route blocked — use alternative approach';
    }
  }

  return {
    clear:           blockers.length === 0,
    blockers,
    warnings,
    alternativeHint,
  };
}
