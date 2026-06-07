/**
 * 2-opt Local Search Improvement
 * Iteratively reverses sub-routes to reduce total distance.
 * O(n²) per pass — runs up to maxIterations passes.
 */

import type { StopPoint } from './types';

function dist(a: StopPoint, b: StopPoint): number {
  const aLat = a.pin?.lat ?? a.lat;
  const aLng = a.pin?.lng ?? a.lng;
  const bLat = b.pin?.lat ?? b.lat;
  const bLng = b.pin?.lng ?? b.lng;
  const dLat = (bLat - aLat) * 111_000;
  const dLng = (bLng - aLng) * 111_000 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLat ** 2 + dLng ** 2);
}

function routeLength(stops: StopPoint[]): number {
  let total = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    total += dist(stops[i], stops[i + 1]);
  }
  return total;
}

function reverseSegment(stops: StopPoint[], i: number, k: number): StopPoint[] {
  const result = [...stops];
  let left = i;
  let right = k;
  while (left < right) {
    [result[left], result[right]] = [result[right], result[left]];
    left++;
    right--;
  }
  return result;
}

export function twoOpt(
  stops: StopPoint[],
  maxIterations = 100,
): { stops: StopPoint[]; improved: boolean; savingM: number } {
  if (stops.length < 4) return { stops, improved: false, savingM: 0 };

  let best = [...stops];
  let bestLength = routeLength(best);
  let improved = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    let localImproved = false;

    for (let i = 1; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = reverseSegment(best, i, k);
        const candidateLength = routeLength(candidate);

        if (candidateLength < bestLength - 0.001) {
          best = candidate;
          bestLength = candidateLength;
          localImproved = true;
          improved = true;
        }
      }
    }

    if (!localImproved) break;
  }

  const originalLength = routeLength(stops);
  return {
    stops: best,
    improved,
    savingM: Math.max(0, originalLength - bestLength),
  };
}
