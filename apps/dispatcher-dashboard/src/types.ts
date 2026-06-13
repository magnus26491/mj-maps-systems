export interface Stop {
  id: string;
  address: string;
  status: 'pending' | 'delivered' | 'failed';
  podUrl: string | null;
  podCapturedAt: string | null;
}

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
  lastPing: string | null;
  heading: number | null;
  stops: Stop[];
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

export interface RouteAnalyticsSummary {
  routeId: string;
  driverId: string;
  driverName: string | null;
  vehicleLabel: string | null;
  status: string;
  shiftStart: string | null;
  finishedAt: string | null;
  totalStops: number;
  completedStops: number;
  failedStops: number;
  totalDistanceKm: number;
  actualDistanceKm: number | null;
  onTime: boolean | null;
  podCount: number;
  redAlerts: number;
  amberAlerts: number;
}

export interface StopAnalyticsRow {
  stopId: string;
  address: string;
  status: 'pending' | 'delivered' | 'failed';
  hasPod: boolean;
  turnAlertLevel: 'GREEN' | 'AMBER' | 'RED' | null;
  createdAt: string;
  podCapturedAt: string | null;
}

export interface AnalyticsSummary {
  completedRoutes: number;
  activeRoutes: number;
  totalStopsDelivered: number;
  totalStopsFailed: number;
  podCaptureRate: number;
  onTimeRate: number;
  avgCompletionMins: number;
  redAlertCount: number;
  amberAlertCount: number;
}

export interface DriverRow {
  id: string;
  name: string;
  email: string;
  planId: string;
  vehicleId: string | null;
  role: 'driver' | 'dispatcher' | 'admin';
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  activeRoutes: number;
  completedToday: number;
}

export interface DriverDetail {
  id: string;
  name: string;
  email: string;
  role: 'driver' | 'dispatcher' | 'admin';
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface DriverRouteRow {
  routeId: string;
  status: string;
  totalStops: number;
  completedStops: number;
  failedStops: number;
  shiftStart: string | null;
  finishedAt: string | null;
  onTime: boolean | null;
  actualDistanceKm: number | null;
}
