/**
 * __tests__/navigation-utils.test.ts
 * Tests for pure utility functions in apps/driver-app/lib/navigation.ts
 * (no network calls — test formatDistance, formatDuration, maneuverArrow only)
 */
import { formatDistance, formatDuration, maneuverArrow } from '../lib/navigation';

describe('formatDistance', () => {
  it('shows metres under 1km', () => {
    expect(formatDistance(500)).toBe('500m');
  });

  it('shows km above 1000m', () => {
    expect(formatDistance(1500)).toBe('1.5km');
  });

  it('rounds metres', () => {
    expect(formatDistance(123.7)).toBe('124m');
  });

  it('shows exactly 1000m as 1.0km', () => {
    expect(formatDistance(1000)).toBe('1.0km');
  });
});

describe('formatDuration', () => {
  it('shows minutes under 1 hour', () => {
    expect(formatDuration(600)).toBe('10 min');
  });

  it('shows hours and minutes', () => {
    expect(formatDuration(3660)).toBe('1h 1m');
  });

  it('shows 0 min for 0 seconds', () => {
    expect(formatDuration(0)).toBe('0 min');
  });

  it('rounds up to the nearest minute', () => {
    expect(formatDuration(59)).toBe('1 min');
  });
});

describe('maneuverArrow', () => {
  it('returns left arrow for turn-left', () => {
    expect(maneuverArrow('turn-left')).toBe('←');
  });

  it('returns right arrow for turn-right', () => {
    expect(maneuverArrow('turn-right')).toBe('→');
  });

  it('returns straight arrow for unknown maneuver', () => {
    expect(maneuverArrow('unknown-type')).toBe('↑');
  });

  it('returns pin for arrive', () => {
    expect(maneuverArrow('arrive')).toBe('📍');
  });

  it('returns up arrow for straight', () => {
    expect(maneuverArrow('straight')).toBe('↑');
  });

  it('returns u-turn arrow for u-turn', () => {
    expect(maneuverArrow('u-turn')).toBe('↩');
  });

  it('returns roundabout arrow for roundabout', () => {
    expect(maneuverArrow('roundabout')).toBe('⟳');
  });
});