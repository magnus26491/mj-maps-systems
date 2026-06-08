export interface Driver {
  id: string;
  name: string;
  email: string;
  planId: string;
  vehicleId: string;
}

export interface Route {
  routeId: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehicleLabel: string;
  status: string;
  totalStops: number;
  completedStops: number;
  failedStops: number;
  totalDistanceKm: number;
  estimatedCompletion: string | null;
  shiftStart: string;
  currentLat: number;
  currentLon: number;
  lastPing: string;
  stops: unknown[];
}

export interface Alert {
  alertId: string;
  routeId: string;
  driverName: string;
  vehicleLabel: string;
  level: 'RED' | 'AMBER';
  stopAddress: string;
  instruction: string;
  roadWidthM: number;
  vehicleMinTurnWidthM: number;
  ts: string;
  dismissed: boolean;
}

export interface Stats {
  activeRoutes: number;
  totalDrivers: number;
  completedStopsToday: number;
  failedStopsToday: number;
  totalDistanceKmToday: number;
  redAlerts: number;
  amberAlerts: number;
}
