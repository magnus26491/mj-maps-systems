/**
 * MJ Maps Systems — Dynamic Replan WebSocket Handler
 *
 * Listens for real-time driver events and re-optimises the remaining
 * route on-the-fly, pushing updates back to the driver app.
 *
 * Events handled:
 *  GPS_UPDATE       — driver position tick (every 10s)
 *  STOP_COMPLETED   — driver marked stop as delivered
 *  STOP_FAILED      — driver marked stop as failed (not home / access denied)
 *  STOP_INSERTED    — dispatcher added a new stop mid-route
 *  TRAFFIC_DELAY    — driver reported a hold (e.g. road closure)
 *  VEHICLE_SWAP     — driver switched to a different vehicle mid-shift
 *
 * Replan triggers:
 *  - STOP_COMPLETED / STOP_FAILED  → replan remaining stops (immediate)
 *  - STOP_INSERTED                 → replan including new stop (immediate)
 *  - TRAFFIC_DELAY                 → replan if delay > 5 min (debounced)
 *  - GPS_UPDATE                    → update ETA only (no replan unless off-route)
 *  - VEHICLE_SWAP                  → replan with new vehicle profile
 *
 * Off-route detection:
 *  If driver deviates > 300m from the expected path for > 60s, trigger replan.
 */

import { optimiseRoute, replanFromPosition, type Stop, type RouteConfig, type RouteResult, type LatLng } from './route-engine';

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type DriverEventType =
  | 'GPS_UPDATE'
  | 'STOP_COMPLETED'
  | 'STOP_FAILED'
  | 'STOP_INSERTED'
  | 'TRAFFIC_DELAY'
  | 'VEHICLE_SWAP';

export interface DriverEvent {
  type: DriverEventType;
  driverId: string;
  routeId: string;
  timestampEpoch: number;
  // GPS_UPDATE
  lat?: number;
  lng?: number;
  speedKmh?: number;
  // STOP_COMPLETED / STOP_FAILED
  stopId?: string;
  failureReason?: string;
  // STOP_INSERTED
  newStop?: Stop;
  // TRAFFIC_DELAY
  delayMinutes?: number;
  // VEHICLE_SWAP
  newVehicleId?: string;
}

export interface ReplanResult {
  routeId: string;
  driverId: string;
  triggeredBy: DriverEventType;
  previousStopCount: number;
  newRoute: RouteResult;
  replanDurationMs: number;
  message: string;
}

export interface ETAUpdate {
  routeId: string;
  driverId: string;
  nextStopId: string | null;
  nextStopEtaEpoch: number | null;
  remainingStops: number;
  remainingDistanceKm: number;
  estimatedCompletionEpoch: number;
}

// ─── ROUTE SESSION ───────────────────────────────────────────────────────────

/**
 * In-memory route session per driver.
 * In production this would be backed by Redis for multi-instance deployments.
 */
export interface RouteSession {
  routeId: string;
  driverId: string;
  config: RouteConfig;
  allStops: Stop[];
  remainingStops: Stop[];
  currentPosition: LatLng;
  lastReplanEpoch: number;
  offRouteStartEpoch: number | null;
  trafficDelayAccumMinutes: number;
}

const sessions = new Map<string, RouteSession>();

export function createSession(
  routeId: string,
  driverId: string,
  stops: Stop[],
  config: RouteConfig,
): RouteSession {
  const session: RouteSession = {
    routeId, driverId, config,
    allStops: [...stops],
    remainingStops: stops.filter(s => !s.completed),
    currentPosition: { lat: config.depotLat, lng: config.depotLng },
    lastReplanEpoch: config.shiftStartEpoch,
    offRouteStartEpoch: null,
    trafficDelayAccumMinutes: 0,
  };
  sessions.set(`${driverId}:${routeId}`, session);
  return session;
}

export function getSession(driverId: string, routeId: string): RouteSession | null {
  return sessions.get(`${driverId}:${routeId}`) ?? null;
}

export function clearSession(driverId: string, routeId: string): void {
  sessions.delete(`${driverId}:${routeId}`);
}

// ─── OFF-ROUTE DETECTION ────────────────────────────────────────────────────

const OFF_ROUTE_THRESHOLD_M = 300;
const OFF_ROUTE_DURATION_S  = 60;

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function nearestStopDistanceM(pos: LatLng, stops: Stop[]): number {
  if (!stops.length) return 0;
  return Math.min(...stops.map(s => haversineM(pos, s)));
}

function isOffRoute(session: RouteSession, pos: LatLng, nowEpoch: number): boolean {
  const distM = nearestStopDistanceM(pos, session.remainingStops);
  if (distM <= OFF_ROUTE_THRESHOLD_M) {
    session.offRouteStartEpoch = null;
    return false;
  }
  if (!session.offRouteStartEpoch) {
    session.offRouteStartEpoch = nowEpoch;
    return false;
  }
  return (nowEpoch - session.offRouteStartEpoch) >= OFF_ROUTE_DURATION_S;
}

// ─── ETA CALCULATION ─────────────────────────────────────────────────────────

const SPEED_KMH = 30;

function calcETAUpdate(session: RouteSession, nowEpoch: number): ETAUpdate {
  const remaining = session.remainingStops;
  const pos = session.currentPosition;

  let distKm = 0;
  let current: LatLng = pos;

  for (const stop of remaining) {
    const d = haversineM(current, stop) / 1000;
    distKm += d;
    current = stop;
  }

  const travelMin = (distKm / SPEED_KMH) * 60;
  const serviceMin = remaining.reduce((s, st) => s + (st.serviceMinutes ?? 3), 0);
  const completionEpoch = nowEpoch + (travelMin + serviceMin) * 60;

  const nextStop = remaining[0] ?? null;
  const nextStopTravelMin = nextStop ? (haversineM(pos, nextStop) / 1000 / SPEED_KMH) * 60 : 0;
  const nextStopEta = nextStop ? nowEpoch + nextStopTravelMin * 60 : null;

  return {
    routeId: session.routeId,
    driverId: session.driverId,
    nextStopId: nextStop?.id ?? null,
    nextStopEtaEpoch: nextStopEta,
    remainingStops: remaining.length,
    remainingDistanceKm: Math.round(distKm * 100) / 100,
    estimatedCompletionEpoch: completionEpoch,
  };
}

// ─── EVENT HANDLERS ──────────────────────────────────────────────────────────

async function handleGpsUpdate(
  session: RouteSession,
  event: DriverEvent,
): Promise<{ eta: ETAUpdate; replan: ReplanResult | null }> {
  const pos: LatLng = { lat: event.lat!, lng: event.lng! };
  session.currentPosition = pos;
  const nowEpoch = event.timestampEpoch;

  let replan: ReplanResult | null = null;

  if (isOffRoute(session, pos, nowEpoch)) {
    const t0 = Date.now();
    const newRoute = await replanFromPosition(pos, session.remainingStops, session.config, nowEpoch);
    session.remainingStops = newRoute.orderedStops;
    session.lastReplanEpoch = nowEpoch;
    session.offRouteStartEpoch = null;
    replan = {
      routeId: session.routeId,
      driverId: session.driverId,
      triggeredBy: 'GPS_UPDATE',
      previousStopCount: session.remainingStops.length,
      newRoute,
      replanDurationMs: Date.now() - t0,
      message: 'Off-route detected — route recalculated from current position.',
    };
  }

  return { eta: calcETAUpdate(session, nowEpoch), replan };
}

async function handleStopEvent(
  session: RouteSession,
  event: DriverEvent,
): Promise<ReplanResult> {
  const prev = session.remainingStops.length;
  const nowEpoch = event.timestampEpoch;

  if (event.type === 'STOP_COMPLETED') {
    session.remainingStops = session.remainingStops.filter(s => s.id !== event.stopId);
  } else if (event.type === 'STOP_FAILED') {
    // Move failed stop to end of remaining with a flag
    const failed = session.remainingStops.find(s => s.id === event.stopId);
    if (failed) {
      session.remainingStops = [
        ...session.remainingStops.filter(s => s.id !== event.stopId),
        { ...failed, notes: `FAILED: ${event.failureReason ?? 'unknown'}` },
      ];
    }
  }

  const t0 = Date.now();
  const newRoute = await replanFromPosition(
    session.currentPosition,
    session.remainingStops,
    session.config,
    nowEpoch,
  );
  session.remainingStops = newRoute.orderedStops;
  session.lastReplanEpoch = nowEpoch;

  return {
    routeId: session.routeId,
    driverId: session.driverId,
    triggeredBy: event.type,
    previousStopCount: prev,
    newRoute,
    replanDurationMs: Date.now() - t0,
    message: event.type === 'STOP_COMPLETED'
      ? `Stop ${event.stopId} completed. Route updated — ${newRoute.orderedStops.length} stops remaining.`
      : `Stop ${event.stopId} failed (${event.failureReason ?? 'unknown'}). Rescheduled to end of route.`,
  };
}

async function handleStopInserted(
  session: RouteSession,
  event: DriverEvent,
): Promise<ReplanResult> {
  if (!event.newStop) throw new Error('STOP_INSERTED event missing newStop');
  const prev = session.remainingStops.length;
  session.remainingStops = [...session.remainingStops, event.newStop];
  const t0 = Date.now();
  const newRoute = await replanFromPosition(
    session.currentPosition,
    session.remainingStops,
    session.config,
    event.timestampEpoch,
  );
  session.remainingStops = newRoute.orderedStops;
  session.lastReplanEpoch = event.timestampEpoch;
  return {
    routeId: session.routeId,
    driverId: session.driverId,
    triggeredBy: 'STOP_INSERTED',
    previousStopCount: prev,
    newRoute,
    replanDurationMs: Date.now() - t0,
    message: `New stop ${event.newStop.id} inserted. Route updated — ${newRoute.orderedStops.length} stops total.`,
  };
}

async function handleVehicleSwap(
  session: RouteSession,
  event: DriverEvent,
): Promise<ReplanResult> {
  if (!event.newVehicleId) throw new Error('VEHICLE_SWAP event missing newVehicleId');
  const prev = session.remainingStops.length;
  session.config = { ...session.config, vehicleId: event.newVehicleId };
  const t0 = Date.now();
  const newRoute = await replanFromPosition(
    session.currentPosition,
    session.remainingStops,
    session.config,
    event.timestampEpoch,
  );
  session.remainingStops = newRoute.orderedStops;
  session.lastReplanEpoch = event.timestampEpoch;
  return {
    routeId: session.routeId,
    driverId: session.driverId,
    triggeredBy: 'VEHICLE_SWAP',
    previousStopCount: prev,
    newRoute,
    replanDurationMs: Date.now() - t0,
    message: `Vehicle swapped to ${event.newVehicleId}. Turn-around scores recalculated.`,
  };
}

// ─── MAIN DISPATCHER ─────────────────────────────────────────────────────────

/**
 * Process a driver event and return the appropriate response.
 *
 * @example
 * const result = await processDriverEvent(event);
 * // Push result to the driver's WebSocket connection
 */
export async function processDriverEvent(
  event: DriverEvent,
): Promise<{ eta?: ETAUpdate; replan?: ReplanResult; error?: string }> {
  const session = getSession(event.driverId, event.routeId);
  if (!session) {
    return { error: `No active session for driver ${event.driverId} / route ${event.routeId}` };
  }

  try {
    switch (event.type) {
      case 'GPS_UPDATE': {
        const { eta, replan } = await handleGpsUpdate(session, event);
        return replan ? { eta, replan } : { eta };
      }
      case 'STOP_COMPLETED':
      case 'STOP_FAILED': {
        const replan = await handleStopEvent(session, event);
        const eta = calcETAUpdate(session, event.timestampEpoch);
        return { eta, replan };
      }
      case 'STOP_INSERTED': {
        const replan = await handleStopInserted(session, event);
        const eta = calcETAUpdate(session, event.timestampEpoch);
        return { eta, replan };
      }
      case 'TRAFFIC_DELAY': {
        session.trafficDelayAccumMinutes += event.delayMinutes ?? 0;
        if ((event.delayMinutes ?? 0) >= 5) {
          const replan = await handleStopEvent(session, {
            ...event,
            type: 'STOP_FAILED',
            stopId: undefined,
          } as any);
          const eta = calcETAUpdate(session, event.timestampEpoch);
          return { eta, replan };
        }
        const eta = calcETAUpdate(session, event.timestampEpoch);
        return { eta };
      }
      case 'VEHICLE_SWAP': {
        const replan = await handleVehicleSwap(session, event);
        const eta = calcETAUpdate(session, event.timestampEpoch);
        return { eta, replan };
      }
      default:
        return { error: `Unknown event type: ${(event as any).type}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Event processing failed: ${msg}` };
  }
}
