/**
 * useOfflineQueue — unit tests
 * Tests the queue accumulation and flush logic in isolation.
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { useOfflineQueue } from '../hooks/useOfflineQueue';

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => () => {}),
}));

// Mock shift store
jest.mock('../store/shift', () => ({
  useShiftStore: (selector: any) => selector({
    token: 'test-token',
    shift: { routeId: 'route-1', stops: [] },
    driverId: 'driver-1',
  }),
}));

global.fetch = jest.fn();

describe('useOfflineQueue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('enqueues events and reports queue length', () => {
    const { result } = renderHook(() => useOfflineQueue());

    act(() => {
      result.current.enqueue({
        type: 'STOP_COMPLETE',
        stopId: 'stop-1',
        driverId: 'driver-1',
        routeId: 'route-1',
      });
      result.current.enqueue({
        type: 'STOP_FAIL',
        stopId: 'stop-2',
        driverId: 'driver-1',
        routeId: 'route-1',
        reason: 'Not in',
      });
    });

    expect(result.current.queueLength()).toBe(2);
  });

  it('flushes queue to API when online', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useOfflineQueue());

    act(() => {
      result.current.enqueue({
        type: 'STOP_COMPLETE',
        stopId: 'stop-1',
        driverId: 'driver-1',
        routeId: 'route-1',
      });
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/driver/event'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.queueLength()).toBe(0);
  });

  it('retains events in queue when API fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useOfflineQueue());

    act(() => {
      result.current.enqueue({
        type: 'LOCATION_PING',
        driverId: 'driver-1',
        routeId: 'route-1',
        lat: 51.5, lng: -0.1,
      });
    });

    await act(async () => {
      await result.current.flush();
    });

    // Event must still be in queue for retry
    expect(result.current.queueLength()).toBe(1);
  });
});
