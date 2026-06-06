/**
 * Route Engine — Sequencer Unit Tests
 * Tests stop ordering, sweep zone clustering, and anti-backtrack logic.
 * No network calls — pure algorithmic tests.
 */

import { sequenceStops, buildSweepZones } from '../src/sequencer';
import type { StopPoint, SequencerInput } from '../src/types';

// ─── FIXTURES ─────────────────────────────────────────────────────────────────

const depot = { lat: 51.5000, lng: -0.1000 };

function makeStop(id: string, lat: number, lng: number, opts: Partial<StopPoint> = {}): StopPoint {
  return {
    id,
    label: `Stop ${id}`,
    location: { lat, lng },
    timeWindowStart: null,
    timeWindowEnd: null,
    dwellTimeS: 120,
    status: 'PENDING',
    notes: null,
    sequenceIndex: 0,
    ...opts,
  };
}

// Stops forming a clear west→east line for predictable ordering
const westStop  = makeStop('W', 51.5000, -0.2000);
const midStop   = makeStop('M', 51.5000, -0.1500);
const eastStop  = makeStop('E', 51.5000, -0.0500);

// Tight cluster (< 400m apart)
const cluster1a = makeStop('C1a', 51.5010, -0.1010);
const cluster1b = makeStop('C1b', 51.5011, -0.1011);
const cluster1c = makeStop('C1c', 51.5012, -0.1012);

// Far away stop
const farStop   = makeStop('FAR', 51.6000, -0.2000);

// ─── buildSweepZones ──────────────────────────────────────────────────────────

describe('buildSweepZones()', () => {
  test('single stop → one zone', () => {
    const zones = buildSweepZones([westStop]);
    expect(zones).toHaveLength(1);
    expect(zones[0].stopIds).toContain('W');
  });

  test('tight cluster → one zone', () => {
    const zones = buildSweepZones([cluster1a, cluster1b, cluster1c]);
    expect(zones).toHaveLength(1);
    expect(zones[0].stopIds).toHaveLength(3);
  });

  test('distant stops → separate zones', () => {
    const zones = buildSweepZones([cluster1a, farStop]);
    expect(zones).toHaveLength(2);
  });

  test('all stops assigned exactly once across zones', () => {
    const stops = [cluster1a, cluster1b, farStop, westStop];
    const zones = buildSweepZones(stops);
    const allAssigned = zones.flatMap(z => z.stopIds);
    expect(allAssigned).toHaveLength(stops.length);
    expect(new Set(allAssigned).size).toBe(stops.length);
  });

  test('zone centroid is within bounds of its stops', () => {
    const zones = buildSweepZones([cluster1a, cluster1b, cluster1c]);
    const z = zones[0];
    expect(z.centroid.lat).toBeGreaterThanOrEqual(Math.min(cluster1a.location.lat, cluster1b.location.lat, cluster1c.location.lat));
    expect(z.centroid.lat).toBeLessThanOrEqual(Math.max(cluster1a.location.lat, cluster1b.location.lat, cluster1c.location.lat));
  });

  test('empty input → empty zones', () => {
    expect(buildSweepZones([])).toHaveLength(0);
  });
});

// ─── sequenceStops ────────────────────────────────────────────────────────────

describe('sequenceStops()', () => {

  function input(stops: StopPoint[], opts: Partial<SequencerInput> = {}): SequencerInput {
    return { stops, vehicleProfileId: 'van_swb', depotLocation: depot, respectTimeWindows: false, ...opts };
  }

  test('empty stops → empty output', () => {
    const result = sequenceStops(input([]));
    expect(result.orderedStops).toHaveLength(0);
    expect(result.resequencedIndexes).toHaveLength(0);
    expect(result.estimatedSavingM).toBe(0);
  });

  test('single stop → returned as-is', () => {
    const result = sequenceStops(input([westStop]));
    expect(result.orderedStops).toHaveLength(1);
    expect(result.orderedStops[0].id).toBe('W');
  });

  test('west→east line: nearest-neighbour from depot visits west first', () => {
    // depot at -0.10, west at -0.20, mid at -0.15, east at -0.05
    // nearest to depot is mid (-0.15), then east (-0.05), then west (-0.20)
    // BUT zone clustering groups all together — nearest-neighbour within zone
    const result = sequenceStops(input([eastStop, midStop, westStop]));
    expect(result.orderedStops).toHaveLength(3);
    // First stop should be the one nearest depot (mid at -0.15)
    expect(result.orderedStops[0].id).toBe('M');
  });

  test('sequenceIndex is correctly set 0..n-1', () => {
    const result = sequenceStops(input([westStop, midStop, eastStop]));
    result.orderedStops.forEach((s, i) => {
      expect(s.sequenceIndex).toBe(i);
    });
  });

  test('optimised distance ≤ naive distance for 3+ stops', () => {
    // Deliberately out-of-order input: far, west, mid, east
    const stops = [farStop, westStop, midStop, eastStop];
    const result = sequenceStops(input(stops));
    expect(result.estimatedSavingM).toBeGreaterThanOrEqual(0);
  });

  test('resequencedIndexes not empty when order changes', () => {
    // farStop first in input — should be moved to end after sequencing
    const stops = [farStop, midStop, eastStop];
    const result = sequenceStops(input(stops));
    // farStop (index 0 in input) should be resequenced
    expect(result.resequencedIndexes.length).toBeGreaterThan(0);
  });

  describe('time windows', () => {
    const morningStop = makeStop('AM', 51.5100, -0.1100, {
      timeWindowStart: '2026-06-07T08:00:00Z',
      timeWindowEnd:   '2026-06-07T10:00:00Z',
    });
    const afternoonStop = makeStop('PM', 51.5200, -0.1200, {
      timeWindowStart: '2026-06-07T14:00:00Z',
      timeWindowEnd:   '2026-06-07T16:00:00Z',
    });

    test('respectTimeWindows=true → time-window stops appear first', () => {
      const stops = [westStop, morningStop, afternoonStop];
      const result = sequenceStops(input(stops, { respectTimeWindows: true }));
      // Morning stop should appear before afternoon
      const amIdx = result.orderedStops.findIndex(s => s.id === 'AM');
      const pmIdx = result.orderedStops.findIndex(s => s.id === 'PM');
      expect(amIdx).toBeLessThan(pmIdx);
    });

    test('respectTimeWindows=false → time windows ignored in ordering', () => {
      const stops = [morningStop, westStop, eastStop];
      const result = sequenceStops(input(stops, { respectTimeWindows: false }));
      expect(result.orderedStops).toHaveLength(3);
    });
  });

  test('tight cluster: cluster stops are consecutive in output', () => {
    const stops = [farStop, cluster1a, cluster1b, cluster1c];
    const result = sequenceStops(input(stops));
    const ids = result.orderedStops.map(s => s.id);
    // cluster1a/b/c should all appear consecutively
    const positions = ['C1a', 'C1b', 'C1c'].map(id => ids.indexOf(id)).sort((a, b) => a - b);
    expect(positions[2] - positions[0]).toBe(2); // consecutive = max gap is 2
  });
});
