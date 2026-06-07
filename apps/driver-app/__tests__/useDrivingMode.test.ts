/**
 * __tests__/useDrivingMode.test.ts
 *
 * Tests for the speed-based driving mode hook.
 */
import { renderHook, act } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useDrivingMode } from '../hooks/useDrivingMode';

describe('useDrivingMode', () => {
  it('returns false initially (parked)', () => {
    const { result } = renderHook(() => useDrivingMode());
    expect(result.current.isDriving).toBe(false);
  });

  it('requests foreground location permissions on mount', () => {
    renderHook(() => useDrivingMode());
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
  });

  it('calls watchPositionAsync after permissions granted', async () => {
    await act(async () => {
      renderHook(() => useDrivingMode());
    });
    expect(Location.watchPositionAsync).toHaveBeenCalled();
  });
});