/**
 * Parking engine unit tests
 */
import { scoreParkingSpot, selectBestSpot } from '../src/index';
import type { ParkingSpot } from '../src/index';

const loadingBay: ParkingSpot = {
  lat: 51.5, lng: -0.1, type: 'loading_bay',
  distanceM: 20, sideOfRoad: 'same', source: 'naptan', confidence: 0.95,
};

const timedYellow: ParkingSpot = {
  lat: 51.5, lng: -0.1, type: 'yellow_line_timed',
  distanceM: 10, sideOfRoad: 'same',
  restrictionStart: '08:00', restrictionEnd: '18:00',
  source: 'osm', confidence: 0.7,
};

const restrictedYellow: ParkingSpot = {
  lat: 51.5, lng: -0.1, type: 'yellow_line_restricted',
  distanceM: 5, sideOfRoad: 'same', source: 'osm', confidence: 0.8,
};

describe('scoreParkingSpot', () => {
  it('loading bay scores higher than yellow line', () => {
    const lbScore  = scoreParkingSpot(loadingBay, 10);
    const ylScore  = scoreParkingSpot(timedYellow, 10); // outside restriction
    expect(lbScore).toBeGreaterThan(ylScore);
  });

  it('timed yellow penalised heavily during restriction hours', () => {
    const offPeak = scoreParkingSpot(timedYellow, 7);   // before 08:00
    const peakHr  = scoreParkingSpot(timedYellow, 12);  // during 08:00-18:00
    expect(offPeak).toBeGreaterThan(peakHr);
  });

  it('restricted yellow always scores low', () => {
    expect(scoreParkingSpot(restrictedYellow, 10)).toBeLessThan(20);
  });

  it('no_stopping scores 0 base', () => {
    const noStop: ParkingSpot = { ...loadingBay, type: 'no_stopping' };
    expect(scoreParkingSpot(noStop, 10)).toBeLessThanOrEqual(30); // distance/side bonuses only
  });
});

describe('selectBestSpot', () => {
  it('returns null recommended for empty spots', () => {
    const r = selectBestSpot([], 10);
    expect(r.recommended).toBeNull();
    expect(r.warningMessage).toBeTruthy();
  });

  it('selects loading bay over timed yellow outside hours', () => {
    const r = selectBestSpot([timedYellow, loadingBay], 10);
    expect(r.recommended?.type).toBe('loading_bay');
  });

  it('returns up to 3 alternatives', () => {
    const spots = [loadingBay, timedYellow, restrictedYellow,
      { ...loadingBay, distanceM: 80, type: 'free_parking' as const },
    ];
    const r = selectBestSpot(spots, 10);
    expect(r.alternatives.length).toBeLessThanOrEqual(3);
  });

  it('provides walking distance from recommended spot', () => {
    const r = selectBestSpot([loadingBay], 10);
    expect(r.walkingMetres).toBe(20);
  });
});
