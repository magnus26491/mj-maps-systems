/**
 * Traffic engine unit tests
 * Tests ETA calculation, delay factor logic, and time-window breach detection.
 */

// ─── Inline helpers mirroring traffic-engine logic ───────────────────────────
function applyDelayFactor(baseEtaMs: number, delayFactor: number): number {
  return Math.round(baseEtaMs * delayFactor);
}

function etaLabel(arrivalMs: number): string {
  const d = new Date(arrivalMs);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function isTimeWindowBreached(
  etaMs: number,
  windowEndMs: number,
  gracePeriodMs = 5 * 60 * 1000,
): boolean {
  return etaMs > windowEndMs + gracePeriodMs;
}

function delayFactorFromCongestion(congestionLevel: number): number {
  // congestionLevel: 0.0 (free flow) → 1.0 (standstill)
  if (congestionLevel < 0)  return 1.0;
  if (congestionLevel > 1)  return 3.5;
  return 1.0 + congestionLevel * 2.5; // linear 1.0 → 3.5
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('applyDelayFactor', () => {
  it('returns base ETA when factor is 1.0 (free flow)', () => {
    expect(applyDelayFactor(600_000, 1.0)).toBe(600_000);
  });
  it('doubles ETA with factor 2.0', () => {
    expect(applyDelayFactor(600_000, 2.0)).toBe(1_200_000);
  });
  it('handles zero base ETA', () => {
    expect(applyDelayFactor(0, 2.5)).toBe(0);
  });
});

describe('etaLabel', () => {
  it('formats midnight correctly', () => {
    // Create a Date at midnight today
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(etaLabel(midnight.getTime())).toBe('00:00');
  });
  it('pads single digit hours and minutes', () => {
    const d = new Date();
    d.setHours(9, 5, 0, 0);
    expect(etaLabel(d.getTime())).toBe('09:05');
  });
});

describe('isTimeWindowBreached', () => {
  const now = Date.now();
  it('not breached when ETA is before window end', () => {
    expect(isTimeWindowBreached(now + 10_000, now + 60_000)).toBe(false);
  });
  it('not breached within grace period', () => {
    expect(isTimeWindowBreached(now + 62_000, now + 60_000, 5 * 60_000)).toBe(false);
  });
  it('breached beyond grace period', () => {
    expect(isTimeWindowBreached(now + 400_000, now + 60_000, 5 * 60_000)).toBe(true);
  });
});

describe('delayFactorFromCongestion', () => {
  it('returns 1.0 for free flow (0.0)', () => {
    expect(delayFactorFromCongestion(0.0)).toBeCloseTo(1.0);
  });
  it('returns 3.5 for standstill (1.0)', () => {
    expect(delayFactorFromCongestion(1.0)).toBeCloseTo(3.5);
  });
  it('clamps below 0 to 1.0', () => {
    expect(delayFactorFromCongestion(-0.5)).toBe(1.0);
  });
  it('clamps above 1 to 3.5', () => {
    expect(delayFactorFromCongestion(1.5)).toBe(3.5);
  });
  it('is monotonically increasing', () => {
    const f1 = delayFactorFromCongestion(0.2);
    const f2 = delayFactorFromCongestion(0.5);
    const f3 = delayFactorFromCongestion(0.8);
    expect(f1).toBeLessThan(f2);
    expect(f2).toBeLessThan(f3);
  });
});
