/**
 * lib/types.ts
 * Shared TypeScript interfaces matching backend response shapes exactly.
 * Verified against: dispatcher.ts routes, driver-api.ts, vehicles.ts, pod.ts
 *
 * Plan IDs are canonical (backend authoritative):
 *   'free'       — no subscription
 *   'navigation' — Driver Pro plan (formerly 'pro')
 *   'custom'    — Enterprise plan (formerly 'enterprise')
 *
 * No plan ID strings should be hard-coded in this file or elsewhere in the app.
 * Import PlanId from here; never redeclare it inline.
 */

// Canonical plan IDs (must match backend DB + API)
export type PlanId = 'free' | 'navigation' | 'custom';

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

export interface VehicleSpec {
  id:          string;
  make:        string;
  model:       string;
  year:        number;
  heightM:     number;
  lengthM:     number;
  widthM:      number;
  gvwKg:       number;
  payloadKg:   number;
  hazmat:      boolean;
  profileKey: string;
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
  id:             string;
  name?:          string;
  email:          string;
  role:           string;
  tier?:          string;
  planId:         PlanId;
  isOwner?:       boolean;
  trialEndsAt?:   string;
  planExpiresAt?: string;
}

export interface AuthResponse {
  accessToken:  string;
  refreshToken: string;
  user: {
    id:       string;
    email:    string;
    role:     string;
    tier:     string;
    planId:   PlanId;
    name?:    string;
    isOwner?: boolean;
  };
}

// Offline queue entry
export interface QueuedEvent {
  id:             string;
  type:           string;
  payload:        Record<string, unknown>;
  queuedAt:       number; // epoch ms when first queued
  lastAttemptAt:  number; // epoch ms of most recent send attempt (0 if never tried)
  retryCount:     number;
  critical:       boolean; // if true, never discard
}

export interface ServerMessage {
  type: string;
  [key: string]: unknown;
}

export interface SavedRoute {
  id:          string;
  name:        string;
  stops:       Stop[];
  createdAt:   string;
  lastUsedAt?: string;
}