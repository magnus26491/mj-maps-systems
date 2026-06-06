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
 */

// ─── ENDPOINTS ──────────────────────────────────────────────────────────────

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
] as const;

// ─── CIRCUIT BREAKER STATE ───────────────────────────────────────────────────

interface EndpointState {
  consecutiveFails: number;
  openUntil: number; // timestamp ms — 0 means closed (healthy)
  inFlight: number;
}

const endpointState: Map<string, EndpointState> = new Map(
  OVERPASS_ENDPOINTS.map(ep => [ep, { consecutiveFails: 0, openUntil: 0, inFlight: 0 }])
);

const CIRCUIT_OPEN_MS    = 60_000; // 60s cooldown after 3 consecutive fails
const MAX_INFLIGHT       = 2;      // max concurrent requests per endpoint
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
    if (state.openUntil > now) continue;        // circuit open — skip
    if (state.inFlight >= MAX_INFLIGHT) continue; // too busy
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

/**
 * Execute an Overpass QL query against the mirror pool.
 * Automatically retries with backoff across available endpoints.
 *
 * @param query  Raw Overpass QL string
 * @returns      Parsed JSON response
 * @throws       Error if all endpoints and retries are exhausted
 */
export async function runOverpassQuery(query: string): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1));

    const ep = getAvailableEndpoint();
    if (!ep) {
      // All endpoints busy or open — wait and retry
      await sleep(2_000);
      continue;
    }

    const state = endpointState.get(ep)!;
    state.inFlight++;

    try {
      const resp = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} from ${ep}`);
      }

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

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────

/**
 * Quick health probe — runs a minimal Overpass query against all endpoints.
 * Returns per-endpoint status useful for monitoring dashboards.
 */
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
