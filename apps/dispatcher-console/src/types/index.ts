// Shared TypeScript types for the dispatcher console.
// These mirror the API layer response shapes.

export type AlertLevel = 'GREEN' | 'AMBER' | 'RED';
export type StopStatus = 'pending' | 'completed' | 'failed' | 'skipped';
export type RouteStatus = 'planned' | 'active' | 'completed' | 'abandoned';

export interface StopPin {
  lat: number;
  lon: number;
  confidence: number;
  source: string;
  displayAddress: string;
  last50mInstruction?: string;
  accessNotes?: string;
}

export interface TurnAlert {
  level: AlertLevel;
  score: number;
  canForwardTurn: boolean;
  requiresReverse: boolean;
  triggerDistanceM: number;
  instruction: string;
  roadWidthM: number;
  vehicleMinTurnWidthM: number;
}

export interface RouteStop {
  stopId: string;
  address: string;
  pin: StopPin;
  sequence: number;
  eta: string;  // ISO
  etd: string;  // ISO
  cumulativeDistanceKm: number;
  approachSide: 'left' | 'right';
  inCulDeSacBatch: boolean;
  status: StopStatus;
  turnAlert?: TurnAlert;
  dwellMinutes?: number;
  isCollection?: boolean;
  weightKg?: number;
}

export interface ActiveRoute {
  routeId: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehicleLabel: string;
  status: RouteStatus;
  currentLat: number;
  currentLon: number;
  stops: RouteStop[];
  totalStops: number;
  completedStops: number;
  failedStops: number;
  totalDistanceKm: number;
  estimatedCompletion: string; // ISO
  shiftStart: string; // ISO
  lastPing: string; // ISO
}

export interface LiveAlert {
  alertId: string;
  routeId: string;
  driverName: string;
  vehicleLabel: string;
  level: AlertLevel;
  stopAddress: string;
  instruction: string;
  roadWidthM: number;
  vehicleMinTurnWidthM: number;
  ts: string; // ISO
  dismissed: boolean;
}

export interface FleetStats {
  activeRoutes: number;
  totalDrivers: number;
  redAlerts: number;
  amberAlerts: number;
  completedStopsToday: number;
  failedStopsToday: number;
  totalDistanceKmToday: number;
}
