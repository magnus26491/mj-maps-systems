/**
 * Route Engine — Shared Types
 * All types used across approach-planner, sequencer, route-planner.
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
  is_collection?: boolean;
  weight_kg?: number;
  access_notes?: string;
  time_window_start?: string; // ISO
  time_window_end?: string;   // ISO
}

export interface SequencerInput {
  stops: StopPoint[];
  depotLat: number;
  depotLng: number;
  vehicleId: string;
  shiftStartISO: string;
}

export interface SequencerOutput {
  ordered: StopPoint[];
  totalDistanceKm: number;
  estimatedDurationMin: number;
  sweepZones: SweepZone[];
}

export interface SweepZone {
  id: string;
  stopIds: string[];
  centroidLat: number;
  centroidLng: number;
  radiusKm: number;
}

export interface ApproachSide {
  side: 'left' | 'right' | 'either';
  reason: string;
}

export interface TurnAroundMethod {
  method: 'forward' | 'three_point' | 'reverse_out' | 'cannot';
  alertDistanceM: number;
  safeSpotLat?: number;
  safeSpotLng?: number;
}

export interface ApproachedStop extends StopPoint {
  approachSide: ApproachSide;
  turnAround: TurnAroundMethod;
  turnScore: number;
  turnAlertLevel: string;
}
