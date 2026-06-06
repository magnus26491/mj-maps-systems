/**
 * DBSCAN clustering implementation.
 *
 * Density-Based Spatial Clustering of Applications with Noise.
 * Chosen over k-means because:
 *  · No need to specify number of clusters in advance
 *  · Handles irregular shapes (UK street layouts are rarely grid-like)
 *  · Naturally identifies isolated stops (noise) that stand alone
 *  · Epsilon (radius) maps directly to a walking/driving distance
 *
 * Time complexity: O(n²) — acceptable for delivery route sizes (20-200 stops).
 */
import { haversineMetres } from './haversine';
import type { ClusterStop } from './types';

export interface DbscanResult {
  labels: number[];  // Parallel to input stops. -1 = noise, 0+ = cluster id
  numClusters: number;
}

export function dbscan(
  stops: ClusterStop[],
  epsilonMetres: number,
  minPoints: number,
): DbscanResult {
  const n      = stops.length;
  const labels = new Array<number>(n).fill(-2);  // -2 = unvisited
  let clusterId = 0;

  const neighbours = (idx: number): number[] => {
    const result: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j === idx) continue;
      const d = haversineMetres(
        stops[idx].lat, stops[idx].lng,
        stops[j].lat,   stops[j].lng,
      );
      if (d <= epsilonMetres) result.push(j);
    }
    return result;
  };

  const expandCluster = (idx: number, seeds: number[], cid: number) => {
    labels[idx] = cid;
    let i = 0;
    while (i < seeds.length) {
      const seedIdx = seeds[i];
      if (labels[seedIdx] === -2) {
        // Unvisited
        const seedNeighbours = neighbours(seedIdx);
        if (seedNeighbours.length >= minPoints) {
          seeds.push(...seedNeighbours.filter(s => !seeds.includes(s)));
        }
      }
      if (labels[seedIdx] < 0) {
        // Was noise or unvisited — assign to cluster
        labels[seedIdx] = cid;
      }
      i++;
    }
  };

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -2) continue; // already processed

    const nbrs = neighbours(i);
    if (nbrs.length < minPoints) {
      labels[i] = -1; // noise
      continue;
    }

    expandCluster(i, nbrs, clusterId);
    clusterId++;
  }

  return { labels, numClusters: clusterId };
}
