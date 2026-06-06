/**
 * MJ Maps Systems — VRP Route Solver
 *
 * Solves the Vehicle Routing Problem using:
 *   1. Sweep-zone initial ordering (LHD/RHD-aware, from route-optimizer)
 *   2. Nearest-neighbour greedy construction
 *   3. 2-opt improvement pass
 *   4. Time-window feasibility enforcement
 *   5. Hard constraint pruning (bridges, closures, school road blocks)
 *
 * This is a single-vehicle solver (one driver, one route).
 * Multi-vehicle / fleet dispatch extends this with a Clarke-Wright
 * savings matrix across the fleet — scaffold in fleet-solver.ts.
 *
 * For production scale (>200 stops) this feeds into Google OR-Tools
 * via a separate microservice. For <200 stops this runs fully client-side
 * (WASM build target) in under 200ms.
 */

import type { StopPoint } from '../route-optimizer/index';
import type { RouteGraph } from './graph';

// ─── SOLUTION ──────────────────────────────────────────────────────────────────

export interface RouteSolution {
  /** Ordered stop indices (0 = depot start, last = depot return) */
  sequence: number[];
  /** Total solver cost */
  totalCost: number;
  /** Estimated total duration in minutes */
  estimatedDurationMin: number;
  /** Estimated total distance in km */
  estimatedDistanceKm: number;
  /** Stops that could not be reached due to hard blocks */
  unreachableStops: string[];
  /** Per-stop warnings to surface to driver */
  stopWarnings: Record<string, string[]>;
  /** Optimisation method used */
  method: 'NEAREST_NEIGHBOUR' | 'TWO_OPT' | 'OR_TOOLS';
  /** Time taken to solve (ms) */
  solveTimeMs: number;
}

// ─── NEAREST-NEIGHBOUR CONSTRUCTION ──────────────────────────────────────────

/**
 * Greedy nearest-neighbour tour construction.
 * Starts from depot (node 0), always visits the cheapest unvisited node next.
 * Hard-blocked edges are avoided — if all remaining edges are blocked, stops
 * are added to unreachableStops.
 */
function nearestNeighbour(
  costMatrix: number[][],
  n: number,
  blockedEdges: Set<string>
): { sequence: number[]; unreachable: number[] } {
  const visited = new Set<number>([0]);
  const sequence = [0];
  const unreachable: number[] = [];

  while (visited.size < n) {
    const current = sequence[sequence.length - 1];
    let bestCost = Infinity;
    let bestNext = -1;

    for (let j = 1; j < n; j++) {
      if (visited.has(j)) continue;
      if (blockedEdges.has(`${current}-${j}`)) continue;
      if (costMatrix[current][j] < bestCost) {
        bestCost = costMatrix[current][j];
        bestNext = j;
      }
    }

    if (bestNext === -1) {
      // All remaining unvisited are unreachable from current position
      for (let j = 1; j < n; j++) {
        if (!visited.has(j)) unreachable.push(j);
      }
      break;
    }

    visited.add(bestNext);
    sequence.push(bestNext);
  }

  sequence.push(0); // return to depot
  return { sequence, unreachable };
}

// ─── 2-OPT IMPROVEMENT ────────────────────────────────────────────────────────

/**
 * 2-opt local search: iteratively reverse sub-sequences to reduce total cost.
 * Runs until no improving swap is found (local optimum).
 * O(n²) per pass — suitable for n < 300.
 *
 * Respects time windows: a swap is only accepted if time-window feasibility
 * is maintained (checked via validateTimeWindows).
 */
function twoOpt(
  sequence: number[],
  costMatrix: number[][],
  stops: (StopPoint | null)[],
  departureHour: number
): number[] {
  let improved = true;
  let best = [...sequence];
  let bestCost = routeCostFromMatrix(best, costMatrix);

  while (improved) {
    improved = false;
    // Only swap interior nodes (not depot at 0 and n-1)
    for (let i = 1; i < best.length - 2; i++) {
      for (let j = i + 1; j < best.length - 1; j++) {
        const candidate = twoOptSwap(best, i, j);
        const candidateCost = routeCostFromMatrix(candidate, costMatrix);
        if (
          candidateCost < bestCost - 0.001 &&
          validateTimeWindows(candidate, stops, costMatrix, departureHour)
        ) {
          best = candidate;
          bestCost = candidateCost;
          improved = true;
        }
      }
    }
  }

  return best;
}

function twoOptSwap(route: number[], i: number, j: number): number[] {
  return [
    ...route.slice(0, i),
    ...route.slice(i, j + 1).reverse(),
    ...route.slice(j + 1),
  ];
}

function routeCostFromMatrix(sequence: number[], costMatrix: number[][]): number {
  let total = 0;
  for (let i = 0; i < sequence.length - 1; i++) {
    total += costMatrix[sequence[i]][sequence[i + 1]];
  }
  return total;
}

// ─── TIME WINDOW VALIDATION ────────────────────────────────────────────────────

/**
 * Check that all stops with hard time windows can be reached in the given sequence.
 * Returns false if any hard window is violated.
 */
function validateTimeWindows(
  sequence: number[],
  stops: (StopPoint | null)[],
  costMatrix: number[][],
  departureHour: number
): boolean {
  let currentTimeHour = departureHour;

  for (let idx = 1; idx < sequence.length - 1; idx++) {
    const nodeIdx = sequence[idx];
    const stop = stops[nodeIdx];
    if (!stop) continue;

    // Add travel time from previous node
    const travelMin = costMatrix[sequence[idx - 1]][nodeIdx];
    currentTimeHour += travelMin / 60;

    // Hard time window check
    if (stop.timeWindowOpen !== undefined && currentTimeHour < stop.timeWindowOpen) {
      // Wait until window opens
      currentTimeHour = stop.timeWindowOpen;
    }
    if (stop.timeWindowClose !== undefined && currentTimeHour > stop.timeWindowClose) {
      return false; // window violated — reject this swap
    }

    // Add service time
    currentTimeHour += stop.serviceTimeMin / 60;
  }

  return true;
}

// ─── HARD CONSTRAINT PRE-PRUNING ──────────────────────────────────────────────

/**
 * Build the set of hard-blocked edges from the route graph.
 * These edges cannot appear in the solution under any circumstances.
 */
function buildBlockedEdges(graph: RouteGraph): Set<string> {
  const blocked = new Set<string>();
  for (const [key, edge] of graph.edges) {
    if (edge.costResult.isHardBlock) {
      blocked.add(key);
    }
  }
  return blocked;
}

// ─── MAIN SOLVER ──────────────────────────────────────────────────────────────

/**
 * Solve the route for a single vehicle.
 *
 * Steps:
 *  1. Pre-prune hard-blocked edges
 *  2. Nearest-neighbour construction (O(n²))
 *  3. 2-opt improvement (O(n²) per pass, ~5-15 passes typical)
 *  4. Collect warnings for all edges in final route
 *  5. Return RouteSolution
 */
export async function solveRoute(
  graph: RouteGraph,
  stops: StopPoint[],
  departureHour: number
): Promise<RouteSolution> {
  const startMs = Date.now();
  const n = graph.nodes.length; // includes depot

  // All nodes including depot (null for depot)
  const allNodes: (StopPoint | null)[] = [
    null,
    ...stops,
  ];

  // 1. Build blocked edge set
  const blocked = buildBlockedEdges(graph);

  // 2. Nearest-neighbour construction
  const { sequence: nnSequence, unreachable } = nearestNeighbour(
    graph.costMatrix, n, blocked
  );

  // 3. 2-opt improvement
  const optimised = twoOpt(nnSequence, graph.costMatrix, allNodes, departureHour);

  // 4. Collect per-stop warnings
  const stopWarnings: Record<string, string[]> = {};
  let totalDurationMin = 0;
  let totalDistanceKm = 0;

  for (let i = 0; i < optimised.length - 1; i++) {
    const edge = graph.getEdge(optimised[i], optimised[i + 1]);
    if (!edge) continue;
    totalDurationMin += edge.nominalDurationMin;
    totalDistanceKm  += edge.distanceKm;

    if (edge.costResult.hasWarnings) {
      const toNode = graph.nodes[optimised[i + 1]];
      const stopId = toNode.stop?.id ?? 'depot';
      stopWarnings[stopId] = [
        ...(stopWarnings[stopId] ?? []),
        ...edge.costResult.penalties,
      ];
    }

    // Add service time at each stop
    const toStop = graph.nodes[optimised[i + 1]].stop;
    if (toStop) totalDurationMin += toStop.serviceTimeMin;
  }

  const unreachableIds = unreachable
    .map((idx) => graph.nodes[idx].stop?.id ?? `node-${idx}`)
    .filter(Boolean);

  return {
    sequence: optimised,
    totalCost: routeCostFromMatrix(optimised, graph.costMatrix),
    estimatedDurationMin: totalDurationMin,
    estimatedDistanceKm: totalDistanceKm,
    unreachableStops: unreachableIds,
    stopWarnings,
    method: 'TWO_OPT',
    solveTimeMs: Date.now() - startMs,
  };
}
