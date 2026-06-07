/**
 * Route Engine — Shared Types
 * All types used across approach-planner, sequencer, route-planner.
 *
 * IMPORTANT: StopPoint uses flat lat/lng (NOT .location.lat) throughout.
 * TurnAroundMethod and ApproachSide are string union types (not objects).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface StopPoint {
  id: string;
  address: string;
  lat: number;
  lng: number;
  what3words?: string;
  dwell_minutes?: number;
  dwellTimeS?: number;         // seconds; 0 = use default 120s
  is_collection?: boolean;
  weight_kg?: number;
  access_notes?: string;
  time_window_start?: string;  // ISO
  time_window_end?: string;    // ISO
  sequenceIndex?: number;      // set by sequencer
}

export interface SequencerInput {
  stops: StopPoint[];
  depotLat: number;
  depotLng: number;
  vehicleId: string;
  vehicleProfileId?: string;
  shiftStartISO?: string;
  depotLocation?: LatLng;      // convenience alias — sequencer uses depotLat/depotLng
  respectTimeWindows?: boolean;
}

export interface SequencerOutput {
  ordered: StopPoint[];
  totalDistanceKm: number;
  estimatedDurationMin: number;
  sweepZones: SweepZone[];
  /** @deprecated use ordered */ orderedStops?: StopPoint[];
  resequencedIndexes?: number[];
  estimatedSavingM?: number;
}

export interface SweepZone {
  id: string;
  stopIds: string[];
  centroidLat: number;
  centroidLng: number;
  radiusKm: number;
  /** @deprecated use centroidLat/centroidLng */ centroid?: LatLng;
  radiusM?: number;
  entryBearing?: number | null;
}

/** Approach side — string union */
export type ApproachSide = 'LEFT' | 'RIGHT' | 'EITHER';

/** Turn-around method — string union */
export type TurnAroundMethod = 'NOT_REQUIRED' | 'FORWARD_TURN' | 'THREE_POINT' | 'REVERSE_OUT' | 'cannot';

export interface ApproachedStop extends StopPoint {
  approachSide: ApproachSide;
  turnAroundMethod: TurnAroundMethod;
  turnScore: number;
  turnAlertLevel: string;
  hasAlternateApproach: boolean;
  alternateApproachWaypoint: LatLng | null;
  alertDistanceM: number;
}

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
}

// ─── Legacy aliases kept for cross-service compat ────────────────────────────
export type Stop            = StopPoint;
export type RouteConstraints = SequencerInput;
export type SolverInput     = SequencerInput;
export type SolverResult    = SequencerOutput;
export type StopStatus      = 'pending' | 'completed' | 'failed' | 'skipped';
export interface TimeWindow { start: string; end: string; }
