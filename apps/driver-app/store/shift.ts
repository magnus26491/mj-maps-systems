/**
 * Shift store — Zustand
 *
 * Extended from initial scaffold to support:
 *  · token + driverId for auth (set at shift start / login)
 *  · vehicleId exposed at top level for hooks
 *  · routeId for WebSocket channel
 *  · wsConnected flag for offline queue awareness
 *  · applyReorder — server re-optimised stop sequence
 *  · applyStopUpdate — patch a single stop (turn score, ETA, intel)
 *  · applyEtaUpdate — bulk ETA refresh from traffic engine
 *  · startShift now accepts pre-optimised ordered stops from API
 */
import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DeliveryStop {
  id:           string;
  index:        number;
  address:      string;
  notes:        string | null;
  lat?:         number;
  lng?:         number;
  parcelCount:  number;
  etaLabel:     string | null;
  distanceM:    number | null;
  alertLevel:   'GREEN' | 'AMBER' | 'RED' | null;
  turnScore?:   number | null;
  turnReason?:  string | null;
  status:       'pending' | 'completed' | 'failed';
}

export interface Shift {
  id:         string;
  vehicleId:  string;
  routeId:    string;
  totalStops: number;
  startedAt:  number;
}

interface EtaMap { [stopId: string]: string; }

interface ShiftState {
  // ── Auth / identity ──────────────────────────────────────────────────────
  token:       string | null;
  driverId:    string | null;
  vehicleId:   string | null;
  setAuth:     (token: string, driverId: string) => void;

  // ── Shift ─────────────────────────────────────────────────────────────────
  isActive:    boolean;
  shift:       Shift | null;
  stops:       DeliveryStop[];
  currentStop: DeliveryStop | null;
  nextStop:    DeliveryStop | null;
  wsConnected: boolean;

  // ── Actions ───────────────────────────────────────────────────────────────
  startShift:      (orderedStops: Omit<DeliveryStop, 'etaLabel' | 'distanceM' | 'alertLevel'>[], vehicleId: string) => void;
  endShift:        () => void;
  completeStop:    () => void;
  failStop:        () => void;
  setStops:        (stops: DeliveryStop[]) => void;
  updateStopAlert: (stopId: string, alert: 'GREEN' | 'AMBER' | 'RED') => void;

  // ── Live update actions (from WebSocket) ─────────────────────────────────
  applyReorder:     (orderedStops: DeliveryStop[]) => void;
  applyStopUpdate:  (stopId: string, patch: Partial<DeliveryStop>) => void;
  applyEtaUpdate:   (etas: EtaMap) => void;
  setWsConnected:   (connected: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const nextPending = (stops: DeliveryStop[]) =>
  stops.find(s => s.status === 'pending') ?? null;

const afterPending = (stops: DeliveryStop[], excludeId?: string) =>
  stops.find(s => s.status === 'pending' && s.id !== excludeId) ?? null;

// ─── Store ────────────────────────────────────────────────────────────────────
export const useShiftStore = create<ShiftState>((set, get) => ({
  // Auth
  token:    null,
  driverId: null,
  vehicleId: null,

  setAuth: (token, driverId) => set({ token, driverId }),

  // Shift state
  isActive:    false,
  shift:       null,
  stops:       [],
  currentStop: null,
  nextStop:    null,
  wsConnected: false,

  setWsConnected: (connected) => set({ wsConnected: connected }),

  // ── startShift ─────────────────────────────────────────────────────────────
  // Accepts pre-optimised stops from API or greedy fallback from shift-start.
  startShift: (orderedStops, vehicleId) => {
    const routeId  = `route-${Date.now()}`;
    const shiftId  = `shift-${Date.now()}`;

    const stops: DeliveryStop[] = orderedStops.map((s, i) => ({
      etaLabel:   null,
      distanceM:  null,
      alertLevel: null,
      turnScore:  null,
      turnReason: null,
      lat:        s.lat,
      lng:        s.lng,
      ...s,
      index:  i,
      status: 'pending' as const,
    }));

    const current = nextPending(stops);
    const next    = afterPending(stops, current?.id);

    set({
      isActive:    true,
      vehicleId,
      shift: {
        id:         shiftId,
        routeId,
        vehicleId,
        totalStops: stops.length,
        startedAt:  Date.now(),
      },
      stops,
      currentStop: current,
      nextStop:    next,
    });
  },

  // ── endShift ───────────────────────────────────────────────────────────────
  endShift: () => set({
    isActive: false, shift: null, stops: [],
    currentStop: null, nextStop: null, vehicleId: null,
  }),

  // ── setStops ───────────────────────────────────────────────────────────────
  setStops: (stops) => {
    const current = nextPending(stops);
    const next    = afterPending(stops, current?.id);
    set(s => ({
      stops,
      currentStop: current,
      nextStop:    next,
      shift: s.shift ? { ...s.shift, totalStops: stops.length } : null,
    }));
  },

  // ── completeStop ───────────────────────────────────────────────────────────
  completeStop: () => {
    const { stops, currentStop } = get();
    if (!currentStop) return;
    const updated = stops.map(s =>
      s.id === currentStop.id ? { ...s, status: 'completed' as const } : s,
    );
    const next     = nextPending(updated);
    const afterNext = afterPending(updated, next?.id);
    set({ stops: updated, currentStop: next, nextStop: afterNext });
  },

  // ── failStop ───────────────────────────────────────────────────────────────
  failStop: () => {
    const { stops, currentStop } = get();
    if (!currentStop) return;
    const updated = stops.map(s =>
      s.id === currentStop.id ? { ...s, status: 'failed' as const } : s,
    );
    const next      = nextPending(updated);
    const afterNext = afterPending(updated, next?.id);
    set({ stops: updated, currentStop: next, nextStop: afterNext });
  },

  // ── updateStopAlert ────────────────────────────────────────────────────────
  updateStopAlert: (stopId, alert) => set(s => ({
    stops: s.stops.map(stop =>
      stop.id === stopId ? { ...stop, alertLevel: alert } : stop,
    ),
    currentStop: s.currentStop?.id === stopId
      ? { ...s.currentStop, alertLevel: alert }
      : s.currentStop,
  })),

  // ── applyReorder ── server sent a re-optimised stop sequence ───────────────
  applyReorder: (orderedStops) => {
    const current = nextPending(orderedStops);
    const next    = afterPending(orderedStops, current?.id);
    set(s => ({
      stops:       orderedStops,
      currentStop: current,
      nextStop:    next,
      shift: s.shift ? { ...s.shift, totalStops: orderedStops.length } : null,
    }));
  },

  // ── applyStopUpdate ── patch a single stop's intel/score ───────────────────
  applyStopUpdate: (stopId, patch) => set(s => ({
    stops: s.stops.map(stop =>
      stop.id === stopId ? { ...stop, ...patch } : stop,
    ),
    currentStop: s.currentStop?.id === stopId
      ? { ...s.currentStop, ...patch }
      : s.currentStop,
    nextStop: s.nextStop?.id === stopId
      ? { ...s.nextStop, ...patch }
      : s.nextStop,
  })),

  // ── applyEtaUpdate ── bulk ETA refresh from traffic engine ─────────────────
  applyEtaUpdate: (etas) => set(s => ({
    stops: s.stops.map(stop => ({
      ...stop,
      etaLabel: etas[stop.id] ?? stop.etaLabel,
    })),
    currentStop: s.currentStop
      ? { ...s.currentStop, etaLabel: etas[s.currentStop.id] ?? s.currentStop.etaLabel }
      : null,
    nextStop: s.nextStop
      ? { ...s.nextStop, etaLabel: etas[s.nextStop.id] ?? s.nextStop.etaLabel }
      : null,
  })),
}));
