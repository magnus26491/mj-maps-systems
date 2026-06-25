/**
 * Routing layer interfaces — shared types for OSRM, Valhalla, and OR-Tools.
 *
 * All implementations (real and fallback) satisfy these contracts so the
 * caller in driver-api.ts never needs to know which engine is active.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

// ── Matrix ───────────────────────────────────────────────────────────────────

export interface MatrixResult {
  /** N×N matrix of travel durations in seconds */
  durations: number[][];
  /** N×N matrix of travel distances in metres */
  distances: number[][];
  /** Wall-clock time of the matrix request */
  durationMs: number;
  /** 'osrm' | 'haversine' — which engine produced this */
  source: 'osrm' | 'haversine';
}

// ── VRP (Vehicle Routing Problem) ────────────────────────────────────────────

export interface VrpStop {
  id: string;
  lat: number;
  lng: number;
  serviceSeconds: number;
  timeWindowOpen?: number;   // unix epoch seconds; undefined = any time
  timeWindowClose?: number;
  priority?: number;
}

export interface VehicleConstraints {
  vehicleId: string;
  heightM?: number;
  widthM?: number;
  lengthM?: number;
  weightKg?: number;
}

export interface VrpInput {
  stops: VrpStop[];
  depot: LatLng;
  vehicleConstraints: VehicleConstraints;
  shiftStartEpoch: number;
  /** Maximum solver wall-clock time. Defaults to 30s or 3s*sqrt(n). */
  timeLimitMs?: number;
}

export interface VrpResult {
  /** Ordered stop IDs (not including depot) */
  orderedIds: string[];
  totalDurationSec: number;
  totalDistanceM: number;
  /** Wall-clock time of the VRP solve */
  durationMs: number;
  /** 'ortools' | 'ts-sequencer' — which solver was used */
  source: 'ortools' | 'ts-sequencer';
}

// ── Maneuvers (turn-by-turn) ──────────────────────────────────────────────────

export interface ManeuverStep {
  type: string;
  instruction: string;
  distanceM: number;
  durationSec: number;
  lat: number;
  lng: number;
  bearingBefore?: number;
  bearingAfter?: number;
}

export interface LegManeuvers {
  /** Index of the origin stop (0 = depot) */
  fromIndex: number;
  /** Index of the destination stop */
  toIndex: number;
  steps: ManeuverStep[];
  /** Encoded polyline (Google format) for MapLibre rendering */
  geometry: string;
  distanceM: number;
  durationSec: number;
}

export interface ManeuverResult {
  legs: LegManeuvers[];
  totalDistanceM: number;
  totalDurationSec: number;
  /** Wall-clock time of the maneuver request */
  durationMs: number;
  /** 'valhalla' | 'none' — which engine produced this */
  source: 'valhalla' | 'none';
}

// ── Provider interfaces ───────────────────────────────────────────────────────

export interface MatrixProvider {
  getMatrix(coords: LatLng[], departAt?: Date): Promise<MatrixResult>;
}

export interface VrpSolver {
  solve(input: VrpInput, matrix: MatrixResult): Promise<VrpResult>;
}

export interface ManeuverProvider {
  getManeuvers(
    orderedCoords: LatLng[],
    constraints: VehicleConstraints,
  ): Promise<ManeuverResult>;
}

// ── Composite result ──────────────────────────────────────────────────────────

export interface RoutingPipelineResult {
  orderedIds: string[];
  maneuvers?: ManeuverResult;
  /** Breakdown for observability */
  timings: {
    matrixMs: number;
    solveMs: number;
    maneuverMs: number;
    totalMs: number;
  };
  sources: {
    matrix: MatrixResult['source'];
    solver: VrpResult['source'];
    maneuvers: ManeuverResult['source'];
  };
}
