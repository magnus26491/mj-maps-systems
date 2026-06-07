/**
 * MJ Maps Systems — Overpass API Client
 *
 * Features:
 *  - 3-endpoint mirror pool (overpass-api.de, kumi.systems, maps.mail.ru)
 *  - Exponential backoff with jitter on failure
 *  - Per-endpoint circuit breaker (skip for 60s after 3 consecutive failures)
 *  - Rate limiting: max 2 concurrent requests per endpoint
 *  - Timeout: 15s per request
 *  - Automatic failover to next endpoint
 *
 * Exports:
 *  - runOverpassQuery(query)          — raw Overpass QL execution
 *  - getRoadContext(lat, lng)         — single-stop road context
 *  - getRoadContextBatch(stops)       — batch road contexts (used by road-enricher)
 *  - OsmRoadContext                   — type for road context result
 *  - checkOverpassHealth()            — endpoint health probe
 */

// ─── ENDPOINTS ──────────────────────────────────────────────────────────────

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
] as const;

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface OsmRoadContext {
  stopId: string;
  road: {
    osmId: number;
    name: string | null;
    highway: string;
    widthM: number;
    maxspeedKph: number | null;
    isDeadEnd: boolean;
    hasTurningHead: boolean;
    lengthToEndM: number;
    surface: string | null;
    access: string | null;
    maxWeightT: number | null;
    maxHeightM: number | null;
    oneway: boolean;
  } | null;
  levelCrossings: Array<{ osmId: number; lat: number; lng: number }>;
  pedestrianPaths: Array<{
    osmId: number;
    highway: string;
    lengthM: number;
    isLit: boolean;
    hasSteps: boolean;
    access: string | null;
  }>;
  fetchedAt: string; // ISO
}

// ─── CIRCUIT BREAKER STATE ───────────────────────────────────────────────────

interface EndpointState {
  consecutiveFails: number;
  openUntil: number;
  inFlight: number;
}

const endpointState: Map<string, EndpointState> = new Map(
  OVERPASS_ENDPOINTS.map(ep => [ep, { consecutiveFails: 0, openUntil: 0, inFlight: 0 }])
);

const CIRCUIT_OPEN_MS    = 60_000;
const MAX_INFLIGHT       = 2;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES        = 3;

// ─── BACKOFF ─────────────────────────────────────────────────────────────────

function backoffMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 10_000);
  const jitter = Math.random() * 500;
  return base + jitter;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── ENDPOINT SELECTOR ───────────────────────────────────────────────────────

function getAvailableEndpoint(): string | null {
  const now = Date.now();
  for (const ep of OVERPASS_ENDPOINTS) {
    const state = endpointState.get(ep)!;
    if (state.openUntil > now) continue;
    if (state.inFlight >= MAX_INFLIGHT) continue;
    return ep;
  }
  return null;
}

function markSuccess(ep: string): void {
  const s = endpointState.get(ep)!;
  s.consecutiveFails = 0;
  s.openUntil = 0;
  s.inFlight = Math.max(0, s.inFlight - 1);
}

function markFailure(ep: string): void {
  const s = endpointState.get(ep)!;
  s.consecutiveFails++;
  s.inFlight = Math.max(0, s.inFlight - 1);
  if (s.consecutiveFails >= 3) {
    s.openUntil = Date.now() + CIRCUIT_OPEN_MS;
    console.warn(`[overpass] Circuit opened for ${ep} — cooling down 60s`);
  }
}

// ─── CORE FETCH ──────────────────────────────────────────────────────────────

export async function runOverpassQuery(query: string): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1));

    const ep = getAvailableEndpoint();
    if (!ep) { await sleep(2_000); continue; }

    const state = endpointState.get(ep)!;
    state.inFlight++;

    try {
      const resp = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${ep}`);

      const json = await resp.json();
      markSuccess(ep);
      return json;
    } catch (err) {
      lastError = err as Error;
      markFailure(ep);
      console.warn(`[overpass] Attempt ${attempt + 1} failed on ${ep}: ${lastError.message}`);
    }
  }

  throw new Error(`Overpass: all retries exhausted. Last error: ${lastError?.message}`);
}

// ─── ROAD CONTEXT QUERIES ────────────────────────────────────────────────────

/** Road-width inference from OSM highway class (fallback when width tag absent) */
const HIGHWAY_WIDTH_DEFAULTS: Record<string, number> = {
  motorway: 11.0, trunk: 9.0, primary: 7.5, secondary: 6.5,
  tertiary: 5.5, unclassified: 5.0, residential: 5.0,
  service: 4.0, living_street: 4.5, track: 3.5,
  path: 2.0, footway: 1.8, cycleway: 2.5,
};

function inferWidth(highway: string, widthTag?: string): number {
  if (widthTag) {
    const parsed = parseFloat(widthTag);
    if (!isNaN(parsed)) return parsed;
  }
  return HIGHWAY_WIDTH_DEFAULTS[highway] ?? 5.0;
}

/**
 * Fetch road context for a single lat/lng.
 * Returns null road if no highway found within 30m.
 */
export async function getRoadContext(lat: number, lng: number, stopId = 'single'): Promise<OsmRoadContext> {
  const radius = 30; // metres
  const query = `
    [out:json][timeout:12];
    (
      way(around:${radius},${lat},${lng})[highway];
    );
    out body geom;
  `;

  let road: OsmRoadContext['road'] = null;
  try {
    const data = await runOverpassQuery(query);
    const elements: any[] = (data as any).elements ?? [];
    const ways = elements.filter((e: any) => e.type === 'way' && e.tags?.highway);

    if (ways.length > 0) {
      // Pick the closest / most relevant way — prefer named roads over tracks
      const sorted = ways.sort((a: any, b: any) => {
        const rank = (h: string) => ['residential','service','unclassified','tertiary','secondary','primary'].indexOf(h);
        return rank(b.tags.highway) - rank(a.tags.highway);
      });
      const w = sorted[0];
      const tags = w.tags ?? {};
      const widthM = inferWidth(tags.highway, tags.width ?? tags['est_width']);

      road = {
        osmId: w.id,
        name: tags.name ?? null,
        highway: tags.highway,
        widthM,
        maxspeedKph: tags.maxspeed ? parseInt(tags.maxspeed) : null,
        isDeadEnd: tags.highway === 'service' && !tags.name,
        hasTurningHead: (tags.turning_circle === 'yes' || tags.amenity === 'turning_circle'),
        lengthToEndM: widthM * 3, // heuristic until geometry analysis
        surface: tags.surface ?? null,
        access: tags.access ?? null,
        maxWeightT: tags.maxweight ? parseFloat(tags.maxweight) : null,
        maxHeightM: tags.maxheight ? parseFloat(tags.maxheight) : null,
        oneway: tags.oneway === 'yes',
      };
    }
  } catch (err) {
    console.warn(`[overpass] getRoadContext failed for ${lat},${lng}: ${(err as Error).message}`);
  }

  return {
    stopId,
    road,
    levelCrossings: [],
    pedestrianPaths: [],
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Batch fetch road contexts for an array of stops.
 * Runs up to 5 concurrent requests to stay within Overpass rate limits.
 */
export async function getRoadContextBatch(
  stops: Array<{ id: string; lat: number; lng: number }>
): Promise<Map<string, OsmRoadContext>> {
  const results = new Map<string, OsmRoadContext>();
  const CONCURRENCY = 5;

  for (let i = 0; i < stops.length; i += CONCURRENCY) {
    const batch = stops.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(s => getRoadContext(s.lat, s.lng, s.id))
    );
    settled.forEach((result, idx) => {
      const stopId = batch[idx].id;
      if (result.status === 'fulfilled') {
        results.set(stopId, result.value);
      } else {
        results.set(stopId, {
          stopId,
          road: null,
          levelCrossings: [],
          pedestrianPaths: [],
          fetchedAt: new Date().toISOString(),
        });
      }
    });
  }

  return results;
}

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────

export async function checkOverpassHealth(): Promise<Record<string, 'ok' | 'degraded' | 'down'>> {
  const probe = '[out:json][timeout:5];node(1);out;';
  const results: Record<string, 'ok' | 'degraded' | 'down'> = {};

  await Promise.allSettled(
    OVERPASS_ENDPOINTS.map(async ep => {
      try {
        const start = Date.now();
        const resp = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(probe)}`,
          signal: AbortSignal.timeout(6_000),
        });
        const latencyMs = Date.now() - start;
        results[ep] = resp.ok && latencyMs < 5_000 ? 'ok' : 'degraded';
      } catch {
        results[ep] = 'down';
      }
    })
  );

  return results;
}
