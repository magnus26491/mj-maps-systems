// ─────────────────────────────────────────────────────────────────────────────
// Traffic Engine
// Fetches live traffic data and adjusts ETA estimates dynamically.
// Sources: TomTom Traffic API (primary) → HERE Traffic (fallback) → static model.
// Also monitors road closures and triggers route recalculation requests.
// ─────────────────────────────────────────────────────────────────────────────
import Fastify from 'fastify';

const app = Fastify({ logger: true });

const TOMTOM_KEY = process.env.TOMTOM_API_KEY;
const HERE_KEY = process.env.HERE_API_KEY;

export interface TrafficSegment {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
}

export interface TrafficResult {
  /** Expected travel time in seconds */
  travelTimeSec: number;
  /** Free-flow travel time in seconds */
  freeFlowSec: number;
  /** Delay in seconds (travelTime - freeFlow) */
  delaySec: number;
  /** Congestion level 0..1 */
  congestion: number;
  /** Data source used */
  source: 'tomtom' | 'here' | 'static';
}

async function fetchTomTom(seg: TrafficSegment): Promise<TrafficResult> {
  if (!TOMTOM_KEY) throw new Error('No TomTom key');
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/` +
    `${seg.fromLat},${seg.fromLon}:${seg.toLat},${seg.toLon}/json` +
    `?key=${TOMTOM_KEY}&traffic=true&travelMode=van`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  const data = (await res.json()) as any;
  const summary = data?.routes?.[0]?.summary;
  if (!summary) throw new Error('No TomTom summary');
  const travelTimeSec: number = summary.travelTimeInSeconds;
  const freeFlowSec: number = summary.noTrafficTravelTimeInSeconds ?? travelTimeSec;
  const delaySec = Math.max(0, travelTimeSec - freeFlowSec);
  return {
    travelTimeSec,
    freeFlowSec,
    delaySec,
    congestion: Math.min(delaySec / 300, 1.0), // >5 min delay = fully congested
    source: 'tomtom',
  };
}

async function fetchHERE(seg: TrafficSegment): Promise<TrafficResult> {
  if (!HERE_KEY) throw new Error('No HERE key');
  const url =
    `https://router.hereapi.com/v8/routes` +
    `?transportMode=truck&origin=${seg.fromLat},${seg.fromLon}` +
    `&destination=${seg.toLat},${seg.toLon}&return=summary&apiKey=${HERE_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  const data = (await res.json()) as any;
  const summary = data?.routes?.[0]?.sections?.[0]?.summary;
  if (!summary) throw new Error('No HERE summary');
  const travelTimeSec: number = summary.duration;
  const baseDuration: number = summary.baseDuration ?? travelTimeSec;
  const delaySec = Math.max(0, travelTimeSec - baseDuration);
  return {
    travelTimeSec,
    freeFlowSec: baseDuration,
    delaySec,
    congestion: Math.min(delaySec / 300, 1.0),
    source: 'here',
  };
}

function staticEstimate(seg: TrafficSegment): TrafficResult {
  // Static: assume 40 kph average, no delay
  const distKm = haversineKm(seg.fromLat, seg.fromLon, seg.toLat, seg.toLon);
  const travelTimeSec = (distKm / 40) * 3600;
  return {
    travelTimeSec,
    freeFlowSec: travelTimeSec,
    delaySec: 0,
    congestion: 0,
    source: 'static',
  };
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

app.post<{ Body: TrafficSegment }>('/traffic/segment', async (req, reply) => {
  let result: TrafficResult;
  try {
    result = await fetchTomTom(req.body);
  } catch {
    try {
      result = await fetchHERE(req.body);
    } catch {
      result = staticEstimate(req.body);
    }
  }
  return reply.send(result);
});

app.get('/health', async () => ({ status: 'ok', service: 'traffic-engine' }));

const PORT = Number(process.env.PORT ?? 3009);
app.listen({ port: PORT, host: '0.0.0.0' });
