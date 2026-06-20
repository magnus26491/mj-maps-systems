/**
 * constants/events.ts
 * Single source of truth for all event type strings and failure codes.
 * Must stay in sync with driver-api.ts on the backend.
 */

export const DriverEventType = {
  LOCATION_UPDATE: 'LOCATION_UPDATE',
  STOP_COMPLETED:  'STOP_COMPLETED',
  STOP_FAILED:      'STOP_FAILED',
  APPROACH_BRIEF:   'APPROACH_BRIEF',
  ROUTE_STARTED:   'ROUTE_STARTED',
  ROUTE_COMPLETED:  'ROUTE_COMPLETED',
} as const;

export type DriverEventType = typeof DriverEventType[keyof typeof DriverEventType];

export const FailureCode = {
  NO_ANSWER:     'NO_ANSWER',
  ACCESS_DENIED: 'ACCESS_DENIED',
  SAFE_PLACE:    'SAFE_PLACE',
  NEIGHBOUR:     'NEIGHBOUR',
} as const;

export type FailureCode = typeof FailureCode[keyof typeof FailureCode];

// WebSocket messages received FROM server
// Must stay in sync with driver-api.ts on the backend
export const ServerMessageType = {
  APPROACH_BRIEF:    'APPROACH_BRIEF',
  PLAN_UPDATE:      'PLAN_UPDATE',       // legacy alias for REPLAN
  WORKLOAD_WARNING:  'WORKLOAD_WARNING',
  WORKLOAD_OVERLOAD: 'WORKLOAD_OVERLOAD',
  // Added to fix vocabulary mismatch with server
  REPLAN:           'REPLAN',           // server sends: type: 'REPLAN'
  ETA_UPDATE:        'ETA_UPDATE',       // server sends: type: 'ETA_UPDATE'
  STOP_COMPLETED:    'STOP_COMPLETED',   // server sends: type: 'STOP_COMPLETED'
  CONNECTED:         'CONNECTED',        // server sends: type: 'CONNECTED'
  ERROR:             'ERROR',            // server sends: type: 'ERROR'
} as const;