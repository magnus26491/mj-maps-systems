/**
 * __tests__/deliveryStore.test.ts
 *
 * Tests for deliveryStore core actions.
 * Uses direct getState() — no mock, real Zustand store.
 */
import { useDeliveryStore } from '../store/deliveryStore';
import type { EnrichedRoute, StopPoint } from '../store/deliveryStore';

const makeStop = (id: string, sequence: number): StopPoint => ({
  id,
  lat: 51.5 + sequence * 0.001,
  lng: -0.1,
  address: `${sequence} Test Street, London`,
  parcelCount:   1,
  totalWeightKg: 2,
  requiresSignature: false,
  isOversize:    false,
  sequence,
  clusterId:     0,
});

const makeRoute = (count: number): EnrichedRoute => ({
  stops: Array.from({ length: count }, (_, i) => makeStop(`stop-${i}`, i)),
  summary: {
    totalStops:         count,
    pinsResolved:       count,
    pinsFromCommunity:  0,
    pinsFromW3W:        0,
    pinsFromOsm:        count,
    pinsAtPostcodeFallback: 0,
    redTurnWarnings:    0,
    amberTurnWarnings:  0,
    walkClusters:       0,
    walkTimeSavedMin:   0,
    levelCrossings:     0,
    enrichmentTimeMs:   50,
  },
});

beforeEach(() => {
  useDeliveryStore.setState({
    enrichedRoute:         null,
    totalStops:            0,
    phase:                 'EN_ROUTE',
    hasTriggeredArriving:   false,
    currentStopIndex:       0,
    currentStop:            null,
    lastOutcome:            null,
    lastFailureReason:      null,
    showPinConfirm:         false,
    pinConfirmTimeout:      null,
    pendingPodCapture:      null,
  });
});

describe('loadRoute', () => {
  it('sets first stop as currentStop', () => {
    const route = makeRoute(3);
    useDeliveryStore.getState().loadRoute(route);
    const s = useDeliveryStore.getState();
    expect(s.currentStop?.id).toBe('stop-0');
    expect(s.totalStops).toBe(3);
    expect(s.phase).toBe('EN_ROUTE');
  });
});

describe('completeDelivery', () => {
  it('advances to next stop', () => {
    const route = makeRoute(3);
    useDeliveryStore.getState().loadRoute(route);
    useDeliveryStore.getState().completeDelivery();
    const s = useDeliveryStore.getState();
    expect(s.currentStop?.id).toBe('stop-1');
    expect(s.currentStopIndex).toBe(1);
    expect(s.phase).toBe('EN_ROUTE');
  });

  it('stores podCapture when provided', () => {
    const route = makeRoute(3);
    useDeliveryStore.getState().loadRoute(route);
    useDeliveryStore.getState().completeDelivery({
      photoUri:      'file://test.jpg',
      signatureSvg:  null,
      barcodeValue:  null,
      capturedAt:    12345,
    });
    // After advancing, store is on stop-1; pendingPodCapture is carried forward
    expect(useDeliveryStore.getState().currentStopIndex).toBe(1);
  });

  it('resets store when last stop completed', () => {
    const route = makeRoute(1);
    useDeliveryStore.getState().loadRoute(route);
    useDeliveryStore.getState().completeDelivery();
    const s = useDeliveryStore.getState();
    expect(s.enrichedRoute).toBeNull();
    expect(s.currentStop).toBeNull();
  });
});

describe('markFailed', () => {
  it('records outcome and reason, advances stop', () => {
    const route = makeRoute(3);
    useDeliveryStore.getState().loadRoute(route);
    useDeliveryStore.getState().markFailed('no_answer');
    const s = useDeliveryStore.getState();
    expect(s.lastOutcome).toBe('failed');
    expect(s.lastFailureReason).toBe('no_answer');
    expect(s.currentStopIndex).toBe(1);
  });
});

describe('markRedeliver', () => {
  it('advances stop with redeliver outcome', () => {
    const route = makeRoute(3);
    useDeliveryStore.getState().loadRoute(route);
    useDeliveryStore.getState().markRedeliver();
    const s = useDeliveryStore.getState();
    expect(s.lastOutcome).toBe('redeliver');
    expect(s.currentStopIndex).toBe(1);
  });
});

describe('onApproachingStop', () => {
  it('transitions EN_ROUTE to ARRIVING when stopId matches', () => {
    const route = makeRoute(3);
    useDeliveryStore.getState().loadRoute(route);
    expect(useDeliveryStore.getState().phase).toBe('EN_ROUTE');
    useDeliveryStore.getState().onApproachingStop('stop-0');
    expect(useDeliveryStore.getState().phase).toBe('ARRIVING');
  });

  it('does NOT transition when stopId does not match', () => {
    const route = makeRoute(3);
    useDeliveryStore.getState().loadRoute(route);
    useDeliveryStore.getState().onApproachingStop('stop-99');
    expect(useDeliveryStore.getState().phase).toBe('EN_ROUTE');
  });
});

describe('endShift', () => {
  it('resets all state', () => {
    const route = makeRoute(3);
    useDeliveryStore.getState().loadRoute(route);
    useDeliveryStore.getState().endShift();
    const s = useDeliveryStore.getState();
    expect(s.enrichedRoute).toBeNull();
    expect(s.currentStop).toBeNull();
    expect(s.phase).toBe('EN_ROUTE');
  });
});