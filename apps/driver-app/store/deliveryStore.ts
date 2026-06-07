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
import * as Haptics from 'expo-haptics';
import { startShiftActivity, updateShiftActivity, endShiftActivity } from '../../modules/liveActivity';
import { showShiftProgressNotification, dismissShiftProgressNotification } from '../../modules/shiftNotification';

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
  /** True when the address geocode had low confidence — driver should confirm the pin */
  requiresPinConfirm?: boolean;
  /** Geocode confidence level */
  geocodeConfidence?: 'high' | 'low' | 'verified';
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

// ─── POD capture ────────────────────────────────────────────────────────────────

export interface PodCapture {
  photoUri?:    string | null;
  signatureSvg?: string | null;
  barcodeValue?: string | null;
  capturedAt?:  number | null;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function extractStreetName(address: string): string {
  return address.split(',')[0].trim().slice(0, 30);
}

// ─── Store state ───────────────────────────────────────────────────────────────

interface DeliveryState {
  // Route data
  enrichedRoute: EnrichedRoute | null;
  totalStops: number;

  // Phase management
  phase: DeliveryPhase;
  hasTriggeredArriving: boolean;
  currentStopIndex: number;

  // Current stop (derived from enrichedRoute.stops + currentStopIndex)
  currentStop: StopPoint | null;

  // Pending POD capture for current stop
  pendingPodCapture: PodCapture | null;

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
  completeDelivery: (podCapture?: PodCapture) => void;
  markRedeliver: () => void;
  markFailed: (reason: FailureReason) => void;
  dismissPinConfirm: () => void;
  savePinCorrection: (lat: number, lng: number) => void;
  endShift: () => void;
  onApproachingStop: (stopId: string) => void;

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
  pendingPodCapture: null,

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

    // Start Live Activity + Android notification for first stop
    if (firstStop) {
      startShiftActivity({
        stopNumber: 1,
        totalStops: route.stops.length,
        streetName: extractStreetName(firstStop.address),
        etaMinutes: route.stops.length * 20,
        progressPct: 0,
      }).catch(() => {});
      showShiftProgressNotification(1, route.stops.length, extractStreetName(firstStop.address)).catch(() => {});
    }
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

  completeDelivery: (podCapture) => {
    const { enrichedRoute, currentStopIndex, pinConfirmTimeout } = get();
    if (pinConfirmTimeout) clearTimeout(pinConfirmTimeout);
    if (!enrichedRoute) return;

    const nextIndex = currentStopIndex + 1;
    const nextStop = enrichedRoute.stops[nextIndex] ?? null;

    set({
      pendingPodCapture: podCapture ?? null,
      lastOutcome: 'delivered',
    });

    // Dismiss PinConfirm if showing
    set({ showPinConfirm: true });

    if (nextStop) {
      set({
        currentStopIndex: nextIndex,
        currentStop: nextStop,
        phase: 'EN_ROUTE',
        hasTriggeredArriving: false,
        showPinConfirm: false,
      });
      updateShiftActivity({
        stopNumber: nextIndex + 1,
        totalStops: enrichedRoute.stops.length,
        streetName: extractStreetName(nextStop.address),
        etaMinutes: (enrichedRoute.stops.length - nextIndex) * 20,
        progressPct: (nextIndex + 1) / enrichedRoute.stops.length,
      }).catch(() => {});
      showShiftProgressNotification(nextIndex + 1, enrichedRoute.stops.length, extractStreetName(nextStop.address)).catch(() => {});
    } else {
      // Route complete
      endShiftActivity().catch(() => {});
      dismissShiftProgressNotification().catch(() => {});
      set({
        enrichedRoute: null, totalStops: 0, currentStopIndex: 0,
        currentStop: null, phase: 'EN_ROUTE', hasTriggeredArriving: false,
        lastOutcome: null, lastFailureReason: null, showPinConfirm: false,
        pendingPodCapture: null,
      });
    }
  },

  markRedeliver: () => {
    const { enrichedRoute, currentStopIndex } = get();
    if (!enrichedRoute) return;

    const nextIndex = currentStopIndex + 1;
    const nextStop = enrichedRoute.stops[nextIndex] ?? null;

    set({
      lastOutcome: 'redeliver',
    });

    if (nextStop) {
      set({
        currentStopIndex: nextIndex,
        currentStop: nextStop,
        phase: 'EN_ROUTE',
        hasTriggeredArriving: false,
        showPinConfirm: false,
        pendingPodCapture: null,
      });
      updateShiftActivity({
        stopNumber: nextIndex + 1,
        totalStops: enrichedRoute.stops.length,
        streetName: extractStreetName(nextStop.address),
        etaMinutes: (enrichedRoute.stops.length - nextIndex) * 20,
        progressPct: (nextIndex + 1) / enrichedRoute.stops.length,
      }).catch(() => {});
      showShiftProgressNotification(nextIndex + 1, enrichedRoute.stops.length, extractStreetName(nextStop.address)).catch(() => {});
    }
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
      pendingPodCapture: null,
    });

    if (nextStop) {
      set({
        currentStopIndex: nextIndex,
        currentStop: nextStop,
        phase: 'EN_ROUTE',
        hasTriggeredArriving: false,
        showPinConfirm: false,
      });
      updateShiftActivity({
        stopNumber: nextIndex + 1,
        totalStops: enrichedRoute.stops.length,
        streetName: extractStreetName(nextStop.address),
        etaMinutes: (enrichedRoute.stops.length - nextIndex) * 20,
        progressPct: (nextIndex + 1) / enrichedRoute.stops.length,
      }).catch(() => {});
      showShiftProgressNotification(nextIndex + 1, enrichedRoute.stops.length, extractStreetName(nextStop.address)).catch(() => {});
    }
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
    endShiftActivity().catch(() => {});
    dismissShiftProgressNotification().catch(() => {});
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
      pendingPodCapture: null,
    });
  },

  onApproachingStop: (stopId) => {
    const { currentStop, phase } = get();
    if (currentStop?.id === stopId && phase === 'EN_ROUTE') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      set({ phase: 'ARRIVING', hasTriggeredArriving: true });
    }
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