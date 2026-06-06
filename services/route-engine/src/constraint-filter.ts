/**
 * Route Engine — vehicle constraint pre-filter
 *
 * Before the solver runs, this module removes or flags stops that the
 * selected vehicle cannot safely service:
 *
 *   HARD block  — bridge/weight/width restriction: BLOCKED severity
 *                 Stop is moved to droppedStops and dispatcher is alerted.
 *
 *   SOFT flag   — RED turn score (< 0.40): stop is kept but flagged.
 *                 Driver receives warning 300m before arrival.
 *                 Route approach may be reversed if alternative exists.
 *
 *   AMBER flag  — AMBER turn score (0.40–0.74): stop kept, driver warned
 *                 at 500m. No rerouting — awareness only.
 *
 * Hard-blocked stops are never silently dropped — they are always
 * returned in droppedStops with a reason so the dispatcher can reassign
 * to a smaller vehicle or mark as failed.
 */

import type { Stop } from './types';

export interface FilterResult {
  serviceable:  Stop[];
  hardBlocked:  Array<{ stop: Stop; reason: string }>;
  softFlagged:  Array<{ stop: Stop; reason: string }>;
}

export function filterByVehicleConstraints(stops: Stop[]): FilterResult {
  const serviceable: Stop[] = [];
  const hardBlocked: Array<{ stop: Stop; reason: string }> = [];
  const softFlagged: Array<{ stop: Stop; reason: string }> = [];

  for (const stop of stops) {
    // Hard block: bridge/restriction BLOCKED
    if (stop.restrictions && !stop.restrictions.clear) {
      const reason = stop.restrictions.alternativeHint
        ?? `Route to stop ${stop.id} is blocked by a vehicle restriction`;
      hardBlocked.push({ stop, reason });
      continue;
    }

    // Soft flag: RED turn score
    if (stop.turnScore && stop.turnScore.alertLevel === 'RED') {
      softFlagged.push({
        stop,
        reason: `Red turn alert at stop ${stop.id}: ${stop.turnScore.recommendation}`,
      });
      serviceable.push(stop); // still route to it — driver decides
      continue;
    }

    serviceable.push(stop);
  }

  return { serviceable, hardBlocked, softFlagged };
}
