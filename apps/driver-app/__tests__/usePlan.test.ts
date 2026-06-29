/**
 * __tests__/usePlan.test.ts
 * Tests for apps/driver-app/lib/usePlan.ts
 */
import { renderHook } from '@testing-library/react-native';
import { usePlan } from '../lib/usePlan';
import { useAuthStore } from '../lib/auth';
import type { PlanId, User } from '../lib/types';

const makeUser = (planId: PlanId, trialEndsAt?: string): User => ({
  id:    '1',
  name:  'Test Driver',
  email: 'test@test.com',
  role:  'driver',
  planId,
  trialEndsAt,
  planExpiresAt: undefined,
});

describe('usePlan', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, token: null });
  });

  it('returns free plan when not authenticated', () => {
    const { result } = renderHook(() => usePlan());
    expect(result.current.plan).toBe('free');
  });

  it('canUse returns false for saved_routes on free plan', () => {
    const { result } = renderHook(() => usePlan());
    expect(result.current.canUse('saved_routes')).toBe(false);
  });

  it('canUse returns true for saved_routes on navigation plan', () => {
    useAuthStore.setState({ user: makeUser('navigation'), token: 'test-token' });
    const { result } = renderHook(() => usePlan());
    expect(result.current.canUse('saved_routes')).toBe(true);
  });

  it('isTrialing returns true when trialEndsAt is in the future', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    useAuthStore.setState({ user: makeUser('free', future), token: 'test-token' });
    const { result } = renderHook(() => usePlan());
    expect(result.current.isTrialing()).toBe(true);
  });

  it('isTrialing returns false when no trial', () => {
    useAuthStore.setState({ user: makeUser('free'), token: 'test-token' });
    const { result } = renderHook(() => usePlan());
    expect(result.current.isTrialing()).toBe(false);
  });

  it('custom plan can use fleet_dispatch', () => {
    useAuthStore.setState({ user: makeUser('custom'), token: 'test-token' });
    const { result } = renderHook(() => usePlan());
    expect(result.current.canUse('fleet_dispatch')).toBe(true);
  });

  it('navigation plan cannot use fleet_dispatch', () => {
    useAuthStore.setState({ user: makeUser('navigation'), token: 'test-token' });
    const { result } = renderHook(() => usePlan());
    expect(result.current.canUse('fleet_dispatch')).toBe(false);
  });
});
