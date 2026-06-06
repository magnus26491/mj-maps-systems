import { applySideOfRoadPass } from '../side-of-road-pass';
import type { StopForPass } from '../side-of-road-pass';

// Simulated stops on a north-south street (lat increases northward)
// Left side (west) = lower lng, right side (east) = higher lng
function makeStop(id: string, lat: number, lng: number, streetName = 'High Street'): StopForPass {
  return { id, lat, lng, streetName };
}

describe('applySideOfRoadPass', () => {
  it('returns unchanged for < 3 stops', () => {
    const stops = [makeStop('a', 51.0, -0.1), makeStop('b', 51.1, -0.1)];
    const result = applySideOfRoadPass(stops);
    expect(result.stops.map(s => s.id)).toEqual(['a', 'b']);
    expect(result.stopsReordered).toBe(0);
  });

  it('returns unchanged for stops on different streets', () => {
    const stops = [
      makeStop('a', 51.0, -0.10, 'Street A'),
      makeStop('b', 51.1, -0.10, 'Street B'),
      makeStop('c', 51.2, -0.10, 'Street C'),
    ];
    const result = applySideOfRoadPass(stops);
    expect(result.groupsProcessed).toBe(0);
  });

  it('groups stops by street name when no osmWayId', () => {
    const stops = [
      makeStop('a', 51.000, -0.101, 'Oak Avenue'),
      makeStop('b', 51.001, -0.099, 'Oak Avenue'),
      makeStop('c', 51.002, -0.101, 'Oak Avenue'),
      makeStop('d', 51.003, -0.099, 'Oak Avenue'),
    ];
    const result = applySideOfRoadPass(stops);
    expect(result.groupsProcessed).toBeGreaterThan(0);
    expect(result.stops).toHaveLength(4);
  });

  it('groups stops by osmWayId when available', () => {
    const stops: StopForPass[] = [
      { id: 'a', lat: 51.000, lng: -0.101, osmWayId: 999 },
      { id: 'b', lat: 51.001, lng: -0.099, osmWayId: 999 },
      { id: 'c', lat: 51.002, lng: -0.101, osmWayId: 999 },
      { id: 'd', lat: 51.003, lng: -0.099, osmWayId: 999 },
    ];
    const result = applySideOfRoadPass(stops);
    expect(result.groupsProcessed).toBe(1);
  });

  it('output contains all original stop ids', () => {
    const stops = [
      makeStop('a', 51.000, -0.101),
      makeStop('b', 51.001, -0.099),
      makeStop('c', 51.002, -0.101),
      makeStop('d', 51.003, -0.099),
      makeStop('e', 51.004, -0.101),
    ];
    const result = applySideOfRoadPass(stops);
    const ids = result.stops.map(s => s.id).sort();
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e'].sort());
  });

  it('left-side stops come before right-side stops after pass', () => {
    // Travel direction: south to north (increasing lat)
    // Left side (west) = lng -0.101, right side (east) = lng -0.099
    // Expected: left stops in order, then right stops reversed
    const stops = [
      makeStop('left1',  51.000, -0.101),
      makeStop('right1', 51.001, -0.099),
      makeStop('left2',  51.002, -0.101),
      makeStop('right2', 51.003, -0.099),
      makeStop('left3',  51.004, -0.101),
    ];
    const result = applySideOfRoadPass(stops);
    const ids = result.stops.map(s => s.id);
    // All left stops should appear before right stops
    const leftIndices  = ['left1','left2','left3'].map(id => ids.indexOf(id));
    const rightIndices = ['right1','right2'].map(id => ids.indexOf(id));
    const maxLeft  = Math.max(...leftIndices);
    const minRight = Math.min(...rightIndices);
    expect(maxLeft).toBeLessThan(minRight);
  });

  it('lapsEliminated is > 0 when stops are reordered', () => {
    const stops = [
      makeStop('a', 51.000, -0.101),
      makeStop('b', 51.001, -0.099),
      makeStop('c', 51.002, -0.101),
      makeStop('d', 51.003, -0.099),
      makeStop('e', 51.004, -0.101),
    ];
    const result = applySideOfRoadPass(stops);
    if (result.stopsReordered > 0) {
      expect(result.lapsEliminated).toBeGreaterThan(0);
    }
  });
});
