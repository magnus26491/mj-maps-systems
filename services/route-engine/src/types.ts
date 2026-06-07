/**
 * Route Engine — Shared Types
 * Single source of truth for all types used across the whole monorepo.
 *
 * IMPORTANT: StopPoint uses flat lat/lng (NOT .location.lat) throughout.
 * TurnAroundMethod and ApproachSide are string union types (not objects).
 *
 * v2 — added all fields required by:
 *   route-engine/src/{solver,eta-assignment,sweep-zones,two-opt,constraint-filter}
 *   dynamic-replan/src/replan-engine
 *   route-graph-solver/{solver,constraint-aggregator}
 */

export interface LatLng {
  lat: number;
  lng: number;
}

// ─── Time Window ──────────────────────────────────────────────────────────────
export interface TimeWindowObj {
  start: string; // ISO string
  end: string;   // ISO string
}

// ─── Road / access restrictions attached to a stop ───────────────────────────
export interface StopRestrictions {
  maxWeightT?: number;
  maxHeightM?: number;
  maxWidthM?: number;
  noHgv?: boolean;
  permitRequired?: boolean;
  accessNote?: string;
}

// ─── Stop status ──────────────────────────────────────────────────────────────
export type StopStatus = 'pending' | 'completed' | 'failed' | 'skipped';

// ─── Core stop ───────────────────────────────────────────────────────────────
export interface StopPoint {
  id: string;
  address: string;
  lat: number;
  lng: number;

  // Property-level pin (exact delivery point, may differ from geocoded lat/lng)
  pin?: LatLng;

  // Metadata
  what3words?: string;
  notes?: string;
  access_notes?: string;

  // Time constraints
  time_window_start?: string;  // ISO
  time_window_end?: string;    // ISO
  timeWindow?: TimeWindowObj;  // convenience object

  // Dwell / service time
  dwell_minutes?: number;
  dwellSeconds?: number;       // preferred; 0 = use default 120s
  /** @deprecated use dwellSeconds */
  dwellTimeS?: number;

  // Payload
  is_collection?: boolean;
  weight_kg?: number;

  // Sequence / planning
  sequenceIndex?: number;      // set by sequencer
  sequence?: number;           // alias for sequenceIndex

  // Live status (set during execution, not planning)
  status?: StopStatus;
  eta?: string;                // ISO — computed by eta-assignment
  etaMs?: number;              // epoch ms

  // Road / access constraints (populated by road-enricher)
  restrictions?: StopRestrictions;
  turnScore?: number;          // 0-1 from computeTurnScore
  turnAlertLevel?: string;     // 'green' | 'amber' | 'red'
}

// ─── Sequencer ────────────────────────────────────────────────────────────────
export interface RouteConstraints {
  maxWeightKg?: number;
  maxStops?: number;
  avoidHgvRoutes?: boolean;
  permitRequired?: boolean;
  maxShiftSeconds?: number;
}

export interface SequencerInput {
  stops: StopPoint[];
  depotLat: number;
  depotLng: number;
  vehicleId: string;
  vehicleProfileId?: string;
  shiftStartISO?: string;
  /** @deprecated use shiftStartISO */
  shiftStartMs?: number;
  depotLocation?: LatLng;      // convenience alias — sequencer uses depotLat/depotLng
  respectTimeWindows?: boolean;
  constraints?: RouteConstraints;
  maxShiftSeconds?: number;    // convenience alias for constraints.maxShiftSeconds
}

export interface SequencerOutput {
  ordered: StopPoint[];
  totalDistanceKm: number;
  /** @deprecated use totalDistanceKm */
  totalDistanceM?: number;
  estimatedDurationMin: number;
  /** @deprecated use estimatedDurationMin */
  totalDurationSec?: number;
  sweepZones: SweepZone[];
  /** @deprecated use ordered */
  orderedStops?: StopPoint[];
  resequencedIndexes?: number[];
  estimatedSavingM?: number;
  droppedStops?: StopPoint[];  // stops that could not be fitted within constraints
}

// ─── Sweep zone ───────────────────────────────────────────────────────────────
export interface SweepZone {
  id: string;
  stopIds: string[];
  centroidLat: number;
  centroidLng: number;
  radiusKm: number;
  /** @deprecated use centroidLat/centroidLng */
  centroid?: LatLng;
  radiusM?: number;
  entryBearing?: number | null;
}

// ─── Approach / turn ─────────────────────────────────────────────────────────
export type ApproachSide = 'LEFT' | 'RIGHT' | 'EITHER';

export type TurnAroundMethod =
  | 'NOT_REQUIRED'
  | 'FORWARD_TURN'
  | 'THREE_POINT'
  | 'REVERSE_OUT'
  | 'cannot'
  | 'forward'
  | 'three_point'
  | 'reverse_out';

export interface ApproachedStop extends StopPoint {
  approachSide: ApproachSide;
  turnAroundMethod: TurnAroundMethod;
  turnScore: number;
  turnAlertLevel: string;
  hasAlternateApproach: boolean;
  alternateApproachWaypoint: LatLng | null;
  alertDistanceM: number;
  /** Set true when a bridge/height restriction blocks the stop */
  bridgeWarning?: boolean;
  /** Set false when bridgeWarning is true; true otherwise */
  canProceed?: boolean;
}

// ─── Planned route ────────────────────────────────────────────────────────────
export interface PlannedRoute {
  id: string;
  vehicleProfileId: string;
  depotLocation: LatLng;
  stops: ApproachedStop[];
  totalDistanceM: number;
  totalDurationS: number;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  createdAt: string;
  redStopsRerouted: number;
  stopsResequenced: number;
  constraints?: RouteConstraints;
  /** Count of stops with bridge/height restrictions */
  bridgeWarnings?: number;
  /** HGV routing flag passed to routing engine */
  hgvRouting?: boolean;
}

// ─── Legacy aliases ───────────────────────────────────────────────────────────
export type Stop            = StopPoint;
export type RouteConstraintsAlias = SequencerInput;
export type SolverInput     = SequencerInput;
export type SolverResult    = SequencerOutput;
export interface TimeWindow { start: string; end: string; }
