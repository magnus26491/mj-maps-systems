/**
 * Billing service unit tests
 */
import {
  daysUntilRenewal,
  getRenewalWarningLevel,
  isWithinGracePeriod,
  formatBillingEvent,
  PLANS,
} from '../src/index';
import type { BillingEvent } from '../src/index';

describe('PLANS', () => {
  it('all plans have positive maxStops', () => {
    Object.values(PLANS).forEach(p => expect(p.maxStops).toBeGreaterThan(0));
  });
  it('free plan costs 0', () => {
    expect(PLANS.free.priceGBP).toBe(0);
  });
  it('fleet plan has highest stop limit', () => {
    expect(PLANS.fleet.maxStops).toBeGreaterThanOrEqual(PLANS.pro.maxStops);
  });
});

describe('daysUntilRenewal', () => {
  it('returns ~7 for renewal in 7 days', () => {
    const renewal = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(daysUntilRenewal(renewal)).toBe(7);
  });
  it('returns 0 for past renewal', () => {
    expect(daysUntilRenewal(Date.now() - 1000)).toBe(0);
  });
});

describe('getRenewalWarningLevel', () => {
  it('returns 7d when 6 days away', () => {
    const renewal = Date.now() + 6 * 24 * 60 * 60 * 1000;
    expect(getRenewalWarningLevel(renewal)).toBe('7d');
  });
  it('returns 3d when 2 days away', () => {
    const renewal = Date.now() + 2 * 24 * 60 * 60 * 1000;
    expect(getRenewalWarningLevel(renewal)).toBe('3d');
  });
  it('returns null when 10 days away', () => {
    const renewal = Date.now() + 10 * 24 * 60 * 60 * 1000;
    expect(getRenewalWarningLevel(renewal)).toBeNull();
  });
});

describe('isWithinGracePeriod', () => {
  it('true for renewal 1 hour ago', () => {
    expect(isWithinGracePeriod(Date.now() - 60 * 60 * 1000)).toBe(true);
  });
  it('false for renewal 3 days ago', () => {
    expect(isWithinGracePeriod(Date.now() - 3 * 24 * 60 * 60 * 1000)).toBe(false);
  });
});

describe('formatBillingEvent', () => {
  const event: BillingEvent = {
    type: 'subscription_renewed',
    userId: 'user-123',
    planId: 'pro',
    amountGBP: 14.99,
    timestamp: new Date('2026-06-01T12:00:00Z').getTime(),
  };
  it('contains userId', () => expect(formatBillingEvent(event)).toContain('user-123'));
  it('contains plan', () => expect(formatBillingEvent(event)).toContain('pro'));
  it('contains amount', () => expect(formatBillingEvent(event)).toContain('14.99'));
  it('contains event type', () => expect(formatBillingEvent(event)).toContain('subscription_renewed'));
});
