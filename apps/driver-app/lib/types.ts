/**
 * lib/types.ts
 * Shared TypeScript interfaces matching backend response shapes exactly.
 * Verified against: dispatcher.ts routes, driver-api.ts, vehicles.ts, pod.ts
 */

export interface Stop {
  id:               string;
  sequence:         number;
  address:          string;
  status:           'pending' | 'completed' | 'failed';
  failureCode:      string | null;
  accessNotes:      string | null;
  last50m:          string | null;
  podPhotoUrl:      string | null;
  pinLat:           number | null;
  pinLon:           number | null;
  fcmCustomerToken: string | null;
}

export interface Route {
  id:          string;
  status:      string;
  driverId:    string;
  driverName:  string;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleId:   string | null;
  createdAt:   string;
}

export interface RouteDetail {
  route: Route[];
  stops: Stop[];
}

export interface Vehicle {
  id:         string;
  make:       string;
  model:      string;
  year:       number;
  heightM:    number;
  gvwKg:      number;
  payloadKg:  number;
  wucPerStop: number;
}

export interface Alert {
  level:   'red' | 'amber' | 'blue';
  type:    string;
  stopId:  string;
  message: string;
}

export interface AccessBrief {
  stopId:      string;
  accessNotes: string | null;
  last50m:     string | null;
  pinLat:      number | null;
  pinLon:      number | null;
}

export interface User {
  id:     string;
  name:   string;
  email:  string;
  role:   string;
  planId: string;
}

export interface AuthResponse {
  ok:   boolean;
  data: {
    token:        string;
    refreshToken: string;
    user:         User;
  };
}

// Offline queue entry
export interface QueuedEvent {
  id:         string;
  type:       string;
  payload:     Record<string, unknown>;
  queuedAt:   number; // epoch ms
  retryCount: number;
  critical:   boolean; // if true, never discard
}

export interface ServerMessage {
  type: string;
  [key: string]: unknown;
}