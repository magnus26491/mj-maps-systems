/**
 * MJ Maps Systems — Route Graph Model
 *
 * Represents the delivery route as a weighted directed graph.
 * Nodes = stops (+ depot). Edges = road segments with constraint-aware costs.
 *
 * Cost matrix is pre-computed before the VRP solver runs,
 * so the solver operates on a flat matrix rather than making
 * per-edge API calls during optimisation.
 */

import type { StopPoint } from '../route-optimizer/index';
import type { EdgeHazards, EdgeCostResult } from './constraint-aggregator';
import { aggregateEdgeCost } from './constraint-aggregator';
import type { VehicleProfile } from '../../packages/vehicle-profiles/index';
import type { DriveHandedness } from '../route-optimizer/index';

// ─── GRAPH NODE ────────────────────────────────────────────────────────────────

export interface GraphNode {
  index: number;          // 0 = depot, 1..N = stops
  stop: StopPoint | null; // null for depot
  isDepot: boolean;
}

// ─── GRAPH EDGE ────────────────────────────────────────────────────────────────

export interface GraphEdge {
  from: number;           // node index
  to: number;             // node index
  /** Straight-line distance in km (haversine) */
  distanceKm: number;
  /** Nominal travel time in minutes (no congestion) */
  nominalDurationMin: number;
  /** Constraint-aware cost multiplier from aggregator */
  costResult: EdgeCostResult;
  /** Final cost used by solver = nominalDurationMin × costMultiplier */
  solverCost: number;
  /** Hazard summary for this edge */
  hazards: EdgeHazards;
}

// ─── COST MATRIX ───────────────────────────────────────────────────────────────

export type CostMatrix = number[][];

// ─── HAVERSINE DISTANCE ────────────────────────────────────────────────────────

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── ROUTE GRAPH CLASS ─────────────────────────────────────────────────────────

export class RouteGraph {
  nodes: GraphNode[];
  edges: Map<string, GraphEdge>; // key: `${from}-${to}`
  costMatrix: CostMatrix;

  constructor(
    private stops: StopPoint[],
    private depot: { lat: number; lng: number },
    private vehicle: VehicleProfile,
    private handedness: DriveHandedness,
    private departureHour: number,
  ) {
    // Build nodes: depot (0) + stops (1..N)
    this.nodes = [
      { index: 0, stop: null, isDepot: true },
      ...stops.map((s, i) => ({ index: i + 1, stop: s, isDepot: false })),
    ];
    this.edges = new Map();
    this.costMatrix = [];
  }

  /**
   * Build the full cost matrix.
   * In production this would call the road network API (OSRM / Valhalla)
   * for real road distances and travel times, then fetch hazard data
   * for each segment. Here we use haversine + average speed as a stub
   * with full constraint scoring.
   *
   * @param hazardResolver - async function that returns EdgeHazards for a segment
   */
  async buildCostMatrix(
    hazardResolver: (
      fromLat: number, fromLng: number,
      toLat: number, toLng: number
    ) => Promise<EdgeHazards>
  ): Promise<void> {
    const n = this.nodes.length;
    this.costMatrix = Array.from({ length: n }, () => new Array(n).fill(0));

    const avgSpeedKmh = 35; // urban/mixed UK average

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;

        const from = this.nodes[i];
        const to   = this.nodes[j];

        const fromLat = from.isDepot ? this.depot.lat : from.stop!.lat;
        const fromLng = from.isDepot ? this.depot.lng : from.stop!.lng;
        const toLat   = to.isDepot   ? this.depot.lat : to.stop!.lat;
        const toLng   = to.isDepot   ? this.depot.lng : to.stop!.lng;

        const distKm = haversineKm(fromLat, fromLng, toLat, toLng);
        const nominalMin = (distKm / avgSpeedKmh) * 60;

        // Estimate arrival time at destination based on departure + cumulative progress
        // For simplicity use departure hour + fraction of route completion
        const estimatedArrival = this.departureHour + (nominalMin / 60);

        const hazards = await hazardResolver(fromLat, fromLng, toLat, toLng);
        const costResult = aggregateEdgeCost({
          hazards,
          vehicle: this.vehicle,
          arrivalHourFloat: estimatedArrival,
          handedness: this.handedness,
        });

        const solverCost = costResult.isHardBlock
          ? 999_999
          : nominalMin * costResult.costMultiplier;

        const edge: GraphEdge = {
          from: i, to: j,
          distanceKm: distKm,
          nominalDurationMin: nominalMin,
          costResult,
          solverCost,
          hazards,
        };

        this.edges.set(`${i}-${j}`, edge);
        this.costMatrix[i][j] = solverCost;
      }
    }
  }

  getEdge(from: number, to: number): GraphEdge | undefined {
    return this.edges.get(`${from}-${to}`);
  }

  /** Total solver cost for a given stop sequence (indices into nodes array) */
  routeCost(sequence: number[]): number {
    let total = 0;
    for (let i = 0; i < sequence.length - 1; i++) {
      total += this.costMatrix[sequence[i]][sequence[i + 1]];
    }
    return total;
  }
}
