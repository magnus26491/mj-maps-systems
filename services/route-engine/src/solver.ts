/**
 * Route Engine — Solver
 * Wraps the sequencer + constraint filter + eta-assignment into a single call.
 */

import type { SequencerInput, SequencerOutput, StopPoint } from './types';

/**
 * Thin orchestration layer — calls sequencer and applies post-processing.
 * The heavy TSP logic lives in sequencer.ts; this file coordinates the pipeline.
 */
export async function solve(input: SequencerInput): Promise<SequencerOutput> {
  const { stops, depotLat, depotLng, vehicleId, shiftStartISO, constraints } = input;

  // Import lazily to avoid circular deps
  const { runSequencer } = await import('./sequencer');
  const { filterConstraints } = await import('./constraint-filter');
  const { assignETAs } = await import('./eta-assignment');

  // 1. Filter out stops that fail vehicle constraints
  const feasible = filterConstraints(stops, vehicleId);
  const dropped = stops.filter(s => !feasible.find(f => f.id === s.id));

  // 2. Run TSP sequencer on feasible stops
  const sequenced = await runSequencer({
    stops: feasible,
    depotLat,
    depotLng,
    vehicleId,
    shiftStartISO,
    respectTimeWindows: input.respectTimeWindows,
  });

  // 3. Assign ETAs
  const ordered = assignETAs(sequenced.ordered, shiftStartISO);

  // 4. Apply max-shift constraint — trim stops that fall outside the window
  const maxShiftSec = constraints?.maxShiftSeconds ?? input.maxShiftSeconds;
  let trimmed = ordered;
  let extraDropped: StopPoint[] = [];
  if (maxShiftSec) {
    const shiftStartMs = shiftStartISO ? new Date(shiftStartISO).getTime() : Date.now();
    trimmed = [];
    extraDropped = [];
    for (const stop of ordered) {
      const etaMs = stop.etaMs ?? (stop.eta ? new Date(stop.eta).getTime() : undefined);
      if (etaMs !== undefined && (etaMs - shiftStartMs) / 1000 > maxShiftSec) {
        extraDropped.push(stop);
      } else {
        trimmed.push(stop);
      }
    }
  }

  const allDropped = [...dropped, ...extraDropped];

  return {
    ordered: trimmed,
    totalDistanceKm: sequenced.totalDistanceKm,
    totalDistanceM: sequenced.totalDistanceKm * 1000,
    estimatedDurationMin: sequenced.estimatedDurationMin,
    totalDurationSec: sequenced.estimatedDurationMin * 60,
    sweepZones: sequenced.sweepZones,
    droppedStops: allDropped,
  };
}
