/**
 * Delivery store — Zustand
 *
 * Manages the three delivery phases and EnrichedStop data:
 *   EN_ROUTE → ARRIVING → AT_STOP
 *
 * Uses EnrichedStop fields from services/osm/road-enricher.ts:
 *   id, address, parcelCount, totalWeightKg, requiresSignature, isOversize,
 *   sequence, access_notes, plusCode, pin, pinMeta, turn, clusterResult, clusterId,
 *   communityPin, driverVerifiedPin
 */
import { create } from 'zustand';

export type DeliveryPhase = 'EN_ROUTE' | 'ARRIVING' | 'AT_STOP';

export type DeliveryOutcome = 'delivered' | 'redeliver' | 'failed';
export type FailureReason =
  | 'no_answer'
  | 'access_blocked'
  | 'wrong_address'
  | 'refused'
  | 'safe_place_left'
  | 'other';

// ─── EnrichedStop types (subset of what backend provides) ─────────────────────

export interface StopPoint {
  id: string;
  lat: number;
  lng: number;
  address: string;
  parcelCount: number;
  totalWeightKg: number;
  requiresSignature: boolean;
  isOversize: boolean;
  sequence: number;
  access_notes?: string;
  plusCode?: string;
  pin?: { lat: number; lng: number };
  pinMeta?: {
    source: string;
    confidence: number;
    accessNotes?: string;
    what3wordsAddress?: string;
  };
  turn?: {
    alertLevel: 'none' | 'amber' | 'red';
    message: string;
    alertDistanceM: number;
    approachBearing: number;
    approach: {
      turnAroundMethod: string;
      message: string;
    };
  };
  clusterResult?: {
    decision: string;
    timeSavedMin: number;
  };
  clusterId: number;
  communityPin?: { lat: number; lng: number; verifiedAt: string; verifyCount: number };
  driverVerifiedPin?: { lat: number; lng: number; verifiedAt: string };
}

export interface EnrichedRoute {
  stops: StopPoint[];
  summary: {
    totalStops: number;
    pinsResolved: number;
    pinsFromCommunity: number;
    pinsFromW3W: number;
    pinsFromOsm: number;
    pinsAtPostcodeFallback: number;
    redTurnWarnings: number;
    amberTurnWarnings: number;
    walkClusters: number;
    walkTimeSavedMin: number;
    levelCrossings: number;
    enrichmentTimeMs: number;
  };
}

// ─── Store state ───────────────────────────────────────────────────────────────

interface DeliveryState {
  // Route data
  enrichedRoute: EnrichedRoute | null;
  totalStops: number;

  // Phase management
  phase: DeliveryPhase;
  hasTriggeredArriving: boolean; // prevent re-trigger on same stop
  currentStopIndex: number;

  // Current stop (derived from enrichedRoute.stops + currentStopIndex)
  currentStop: StopPoint | null;

  // Outcome tracking
  lastOutcome: DeliveryOutcome | null;
  lastFailureReason: FailureReason | null;
  showPinConfirm: boolean;
  pinConfirmTimeout: ReturnType<typeof setTimeout> | null;

  // Actions
  loadRoute: (route: EnrichedRoute) => void;
  setPhase: (phase: DeliveryPhase) => void;
  triggerArriving: () => void;
  markArriving: () => void;
  markAtStop: () => void;
  completeDelivery: () => void;
  markRedeliver: () => void;
  markFailed: (reason: FailureReason) => void;
  dismissPinConfirm: () => void;
  savePinCorrection: (lat: number, lng: number) => void;
  endShift: () => void;

  // Progress helpers
  getCompletedCount: () => number;
  getRemainingTimeEstimate: () => string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  enrichedRoute: null,
  totalStops: 0,
  phase: 'EN_ROUTE',
  hasTriggeredArriving: false,
  currentStopIndex: 0,
  currentStop: null,
  lastOutcome: null,
  lastFailureReason: null,
  showPinConfirm: false,
  pinConfirmTimeout: null,

  loadRoute: (route) => {
    const firstStop = route.stops[0] ?? null;
    set({
      enrichedRoute: route,
      totalStops: route.stops.length,
      currentStopIndex: 0,
      currentStop: firstStop,
      phase: 'EN_ROUTE',
      hasTriggeredArriving: false,
      lastOutcome: null,
      lastFailureReason: null,
      showPinConfirm: false,
    });
  },

  setPhase: (phase) => set({ phase }),

  triggerArriving: () => {
    const { hasTriggeredArriving } = get();
    if (!hasTriggeredArriving) {
      set({ phase: 'ARRIVING', hasTriggeredArriving: true });
    }
  },

  markArriving: () => {
    set({ phase: 'ARRIVING', hasTriggeredArriving: true });
  },

  markAtStop: () => {
    set({ phase: 'AT_STOP' });
  },

  completeDelivery: () => {
    // Clear any existing timeout
    const { pinConfirmTimeout } = get();
    if (pinConfirmTimeout) clearTimeout(pinConfirmTimeout);

    set({
      lastOutcome: 'delivered',
      showPinConfirm: true,
      pinConfirmTimeout: setTimeout(() => {
        set({ showPinConfirm: false, pinConfirmTimeout: null });
      }, 5000),
    });
  },

  markRedeliver: () => {
    const { enrichedRoute, currentStopIndex } = get();
    if (!enrichedRoute) return;

    const nextIndex = currentStopIndex + 1;
    const nextStop = enrichedRoute.stops[nextIndex] ?? null;

    set({
      lastOutcome: 'redeliver',
      currentStopIndex: nextIndex,
      currentStop: nextStop,
      phase: 'EN_ROUTE',
      hasTriggeredArriving: false,
      showPinConfirm: false,
    });
  },

  markFailed: (reason) => {
    const { enrichedRoute, currentStopIndex, pinConfirmTimeout } = get();
    if (pinConfirmTimeout) clearTimeout(pinConfirmTimeout);

    if (!enrichedRoute) return;

    const nextIndex = currentStopIndex + 1;
    const nextStop = enrichedRoute.stops[nextIndex] ?? null;

    set({
      lastOutcome: 'failed',
      lastFailureReason: reason,
      currentStopIndex: nextIndex,
      currentStop: nextStop,
      phase: 'EN_ROUTE',
      hasTriggeredArriving: false,
      showPinConfirm: false,
    });
  },

  dismissPinConfirm: () => {
    const { pinConfirmTimeout } = get();
    if (pinConfirmTimeout) clearTimeout(pinConfirmTimeout);
    set({ showPinConfirm: false, pinConfirmTimeout: null });
  },

  savePinCorrection: (lat, lng) => {
    const { enrichedRoute, currentStopIndex } = get();
    if (!enrichedRoute) return;

    const nextIndex = currentStopIndex + 1;
    const nextStop = enrichedRoute.stops[nextIndex] ?? null;

    set({
      currentStopIndex: nextIndex,
      currentStop: nextStop,
      phase: 'EN_ROUTE',
      hasTriggeredArriving: false,
      showPinConfirm: false,
    });
  },

  endShift: () => {
    const { pinConfirmTimeout } = get();
    if (pinConfirmTimeout) clearTimeout(pinConfirmTimeout);
    set({
      enrichedRoute: null,
      totalStops: 0,
      phase: 'EN_ROUTE',
      hasTriggeredArriving: false,
      currentStopIndex: 0,
      currentStop: null,
      lastOutcome: null,
      lastFailureReason: null,
      showPinConfirm: false,
      pinConfirmTimeout: null,
    });
  },

  getCompletedCount: () => {
    const { currentStopIndex, enrichedRoute } = get();
    return currentStopIndex;
  },

  getRemainingTimeEstimate: () => {
    const { totalStops, currentStopIndex } = get();
    const remaining = totalStops - currentStopIndex;
    // Simple estimate: ~20 min per stop
    const minutes = remaining * 20;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `~${hours}h ${mins}m` : `~${mins}m`;
  },
}));