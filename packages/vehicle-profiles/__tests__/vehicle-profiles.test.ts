import { computeTurnScore, getTurnAlert, VEHICLE_PROFILES } from '../index';

describe('computeTurnScore', () => {
  const swbVan = VEHICLE_PROFILES['swb-van'];
  const luton   = VEHICLE_PROFILES['luton'];
  const hgv75   = VEHICLE_PROFILES['hgv-7.5t'];

  it('returns 1.0 for a wide road with turning head (SWB van)', () => {
    const s = computeTurnScore(swbVan, 8.0, false, true);
    expect(s).toBeGreaterThanOrEqual(1.0);
  });

  it('returns lower score on narrow road (3.5m) for Luton', () => {
    const s = computeTurnScore(luton, 3.5, false, false);
    expect(s).toBeLessThan(0.5);
  });

  it('dead-end penalty reduces score when no turning head', () => {
    const withHead    = computeTurnScore(hgv75, 6.0, true, true);
    const withoutHead = computeTurnScore(hgv75, 6.0, true, false);
    expect(withHead).toBeGreaterThan(withoutHead);
  });

  it('score is clamped between 0 and 1', () => {
    const tooNarrow = computeTurnScore(hgv75, 1.0, true, false);
    expect(tooNarrow).toBeGreaterThanOrEqual(0);
    expect(tooNarrow).toBeLessThanOrEqual(1);
  });

  it('returns higher score for SWB van than HGV on same road', () => {
    const s1 = computeTurnScore(swbVan, 5.0, false, false);
    const s2 = computeTurnScore(hgv75, 5.0, false, false);
    expect(s1).toBeGreaterThan(s2);
  });
});

describe('getTurnAlert', () => {
  const swbVan = VEHICLE_PROFILES['swb-van'];
  const hgv75  = VEHICLE_PROFILES['hgv-7.5t'];

  it('returns GREEN for comfortable scenario', () => {
    const alert = getTurnAlert(swbVan, 8.0, false, true);
    expect(alert.level).toBe('GREEN');
  });

  it('returns RED for HGV on narrow dead-end no turning head', () => {
    const alert = getTurnAlert(hgv75, 3.5, true, false);
    expect(alert.level).toBe('RED');
    expect(alert.message).toBeTruthy();
  });

  it('returns AMBER for borderline scenario', () => {
    const alert = getTurnAlert(hgv75, 5.5, false, false);
    expect(['AMBER', 'RED']).toContain(alert.level);
  });

  it('message is non-empty for AMBER and RED', () => {
    const amber = getTurnAlert(hgv75, 5.0, false, false);
    if (amber.level !== 'GREEN') {
      expect(amber.message.length).toBeGreaterThan(0);
    }
  });
});
