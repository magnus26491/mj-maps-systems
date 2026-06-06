// ─────────────────────────────────────────────────────────────────────────────
// Cluster Engine
// Groups stops into sweep zones for anti-backtracking.
// Exposes endpoint for dispatcher dashboard map view.
// Uses DBSCAN-inspired density clustering with configurable epsilon.
// ─────────────────────────────────────────────────────────────────────────────
import Fastify from 'fastify';

const app = Fastify({ logger: true });

export interface ClusterPoint {
  id: string;
  lat: number;
  lon: number;
}

export interface Cluster {
  clusterId: number;
  points: ClusterPoint[];
  centroidLat: number;
  centroidLon: number;
  radiusKm: number;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Simple radius-based clustering (greedy).
 * More accurate than k-means for geographic route grouping
 * because cluster count is not predefined.
 */
export function clusterPoints(
  points: ClusterPoint[],
  epsilonKm = 0.5,
  minPoints = 1,
): Cluster[] {
  const assigned = new Set<string>();
  const clusters: Cluster[] = [];
  let clusterId = 0;

  for (const seed of points) {
    if (assigned.has(seed.id)) continue;
    const members: ClusterPoint[] = [seed];
    assigned.add(seed.id);

    for (const candidate of points) {
      if (assigned.has(candidate.id)) continue;
      if (haversineKm(seed.lat, seed.lon, candidate.lat, candidate.lon) <= epsilonKm) {
        members.push(candidate);
        assigned.add(candidate.id);
      }
    }

    if (members.length >= minPoints) {
      const centroidLat = members.reduce((s, p) => s + p.lat, 0) / members.length;
      const centroidLon = members.reduce((s, p) => s + p.lon, 0) / members.length;
      const radiusKm = Math.max(
        ...members.map((p) => haversineKm(centroidLat, centroidLon, p.lat, p.lon)),
      );
      clusters.push({ clusterId: clusterId++, points: members, centroidLat, centroidLon, radiusKm });
    }
  }

  return clusters;
}

app.post<{ Body: { points: ClusterPoint[]; epsilonKm?: number; minPoints?: number } }>(
  '/cluster',
  async (req, reply) => {
    const { points, epsilonKm = 0.5, minPoints = 1 } = req.body;
    const result = clusterPoints(points, epsilonKm, minPoints);
    return reply.send(result);
  },
);

app.get('/health', async () => ({ status: 'ok', service: 'cluster-engine' }));

const PORT = Number(process.env.PORT ?? 3010);
app.listen({ port: PORT, host: '0.0.0.0' });
