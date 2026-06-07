/**
 * Route Engine — Sequencer
 *
 * Orchestrates the full multi-pass solver pipeline:
 *   1. Zone-sweep anti-backtrack re-sequence
 *   2. 2-opt local search improvement
 *   3. Side-of-road group flatten
 *   4. Workload scoring and break insertion
 *   5. Build sweep zones
 *
 * This replaces the old thin wrapper that just delegated to solveGraph.
 * The route-engine/solver.ts calls this via `runSequencer()`.
 */

import type { StopPoint, SequencerInput, SequencerOutput } from './types';
import { buildSweepZones } from './sweep-zones';
import { twoOpt } from './two-opt';
import { applyAntiBacktrack } from './anti-backtrack';
import { buildSideGroups, flattenGroups } from '../../cluster-engine/side-of-road-grouper';
import { scoreShiftWorkload } from '../../workload/shift-load-scorer';
import { solveGraph } from '../../route-graph-solver/solver';

export async function runSequencer(
  input: SequencerInput,
): Promise<SequencerOutput> {
  const { stops, depotLat, depotLng, vehicleId, shiftStartISO, respectTimeWindows } = input;

  if (stops.length === 0) {
    return {
      ordered: [],
      totalDistanceKm: 0,
      estimatedDurationMin: 0,
      sweepZones: [],
      droppedStops: [],
    };
  }

  // ── Pass 1: Graph solver (nearest-neighbour + 2-opt) ─────────────────────
  const graphResult = await solveGraph({
    stops,
    depotLat,
    depotLng,
    vehicleId,
    shiftStartISO,
    respectTimeWindows,
  });

  // ── Pass 2: Anti-backtrack zone sweep ────────────────────────────────────
  const sweepZones = buildSweepZones(graphResult.ordered);
  const antiBacktrackResult = applyAntiBacktrack(
    graphResult.ordered,
    sweepZones,
    depotLat,
    depotLng,
  );

  // ── Pass 3: Side-of-road grouping ────────────────────────────────────────
  const sideGroups = buildSideGroups(antiBacktrackResult.ordered);
  const sideOrdered = flattenGroups(sideGroups);

  // ── Pass 4: Final 2-opt on the grouped sequence ──────────────────────────
  const { stops: finalOrdered } = twoOpt(sideOrdered, 50);

  // ── Pass 5: Workload scoring ─────────────────────────────────────────────
  const workloadInputs = finalOrdered.map(s => ({
    stopId:           s.id,
    isOversize:       (s as any).is_oversize ?? false,
    requiresSignature:(s as any).requiresSignature ?? (s as any).requires_signature ?? false,
    parcelCount:      (s as any).parcelCount ?? (s as any).parcel_count ?? 1,
    weight_kg:        s.weight_kg,
    walkDistanceM:    (s as any).walkDistanceM ?? 0,
    flightsOfStairs:  (s as any).flightsOfStairs ?? 0,
  }));
  const workload = scoreShiftWorkload(workloadInputs);

  // Stamp fatigue level onto each stop
  const annotatedStops: StopPoint[] = finalOrdered.map((s, i) => ({
    ...s,
    ...(workload.stopWorkloads[i]
      ? { fatigueLevel: workload.stopWorkloads[i].fatigueLevel }
      : {}),
  }));

  // Rebuild sweep zones on final order for the output
  const finalSweepZones = buildSweepZones(annotatedStops);

  // Compute final route distance
  const distKm = graphResult.totalDistanceKm; // approximate (graph solver computed on similar order)
  const durationMin = (distKm * 1000 / (30 / 3.6)) / 60
    + workload.breaks.reduce((s, b) => s + b.durationMin, 0);

  return {
    ordered:              annotatedStops,
    totalDistanceKm:      distKm,
    estimatedDurationMin: Math.round(durationMin),
    sweepZones:           finalSweepZones,
    droppedStops:         graphResult.droppedStops ?? [],
    resequencedIndexes:   antiBacktrackResult.backtracksRemoved > 0
      ? annotatedStops.map((_, i) => i)
      : [],
    estimatedSavingM: antiBacktrackResult.totalDetourKmEliminated * 1000,
  };
}
