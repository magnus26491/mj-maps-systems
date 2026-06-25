/**
 * simulate-shift.ts
 *
 * End-to-end shift simulation: exercises the full Stage 4–9 API surface
 * by pretending to be a driver completing a route.
 *
 * What this script does:
 *   1. Authenticates as a test driver (POST /api/v1/auth/token)
 *   2. Optimises a small test route (POST /api/v1/routes/optimise)
 *   3. For each stop in order:
 *      a. Requests a navigation leg (POST /api/v1/navigate/leg)
 *      b. Streams GPS movement toward the stop (POST /api/v1/location, 5 pings)
 *      c. Checks stop confidence (GET /api/v1/stops/:id/confidence) if stopId available
 *      d. Randomly completes (80%) or fails (20%) the stop
 *   4. After all stops: flushes any queued items (POST /api/v1/sync/flush)
 *   5. Raises a welfare-check safety event (POST /api/v1/safety/event)
 *
 * Usage:
 *   API_URL=http://localhost:3000 npx ts-node scripts/simulate-shift.ts
 *
 * Environment vars:
 *   API_URL         — default http://localhost:3000
 *   DRIVER_ID       — test driver ID (default: sim-driver-1)
 *   DRIVER_SECRET   — secret for /auth/token (default: dev-secret-not-for-production)
 *   VEHICLE_ID      — vehicle profile to use (default: TRANSIT_LWB_GB)
 */

const BASE = process.env.API_URL ?? 'http://localhost:3000';
const DRIVER_ID = process.env.DRIVER_ID ?? 'sim-driver-1';
const DRIVER_SECRET = process.env.DRIVER_SECRET ?? 'dev-secret-not-for-production';
const VEHICLE_ID = process.env.VEHICLE_ID ?? 'TRANSIT_LWB_GB';

const TEST_STOPS = [
  { id: 'sim-stop-1', lat: 51.5005, lng: -0.1245, notes: '1 Parliament Sq, London' },
  { id: 'sim-stop-2', lat: 51.5074, lng: -0.1278, notes: '10 Downing St, London' },
  { id: 'sim-stop-3', lat: 51.5014, lng: -0.1419, notes: 'Victoria Station, London' },
];

const DEPOT = { lat: 51.4950, lng: -0.1440 };

async function apiFetch(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${path}: ${JSON.stringify(json)}`);
  return json;
}

function interpolate(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log(`[simulate-shift] Connecting to ${BASE}`);

  // 1. Authenticate
  const authResp = await apiFetch('/api/v1/auth/token', {
    method: 'POST',
    body: { driverId: DRIVER_ID, secret: DRIVER_SECRET },
  });
  const token: string = authResp.data?.token;
  console.log(`[simulate-shift] Authenticated as ${DRIVER_ID}`);

  // 2. Optimise route
  const optimiseResp = await apiFetch('/api/v1/routes/optimise', {
    method: 'POST',
    token,
    body: {
      stops: TEST_STOPS.map(s => ({ id: s.id, lat: s.lat, lng: s.lng, notes: s.notes })),
      config: {
        vehicleId:     VEHICLE_ID,
        depotLat:      DEPOT.lat,
        depotLng:      DEPOT.lng,
        returnToDepot: true,
      },
    },
  });
  const { routeId, orderedStops } = optimiseResp.data ?? optimiseResp;
  console.log(`[simulate-shift] Route optimised — routeId=${routeId}, stops=${orderedStops?.length ?? TEST_STOPS.length}`);

  const stops: typeof TEST_STOPS = (orderedStops?.length ? orderedStops : TEST_STOPS);

  let fromLat = DEPOT.lat;
  let fromLng = DEPOT.lng;
  const syncQueue: { endpoint: string; method: 'POST'; body: Record<string, unknown> }[] = [];

  // 3. Drive each stop
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    console.log(`\n[simulate-shift] ── Stop ${i + 1}/${stops.length}: ${stop.notes ?? stop.id}`);

    // 3a. Request navigation leg
    try {
      const navResp = await apiFetch('/api/v1/navigate/leg', {
        method: 'POST',
        token,
        body: { fromLat, fromLng, toLat: stop.lat, toLng: stop.lng, vehicleId: VEHICLE_ID },
      });
      const nav = navResp.data;
      console.log(`  nav: ${nav?.steps?.length ?? 0} steps, ${nav?.totalDistanceM ?? '?'}m, guardWarnings=${nav?.guardWarnings?.length ?? 0}`);
    } catch (err) {
      console.warn(`  nav failed (non-fatal): ${(err as Error).message}`);
    }

    // 3b. GPS pings (5 interpolated positions)
    for (let t = 0; t <= 4; t++) {
      const frac = t / 4;
      const pingLat = interpolate(fromLat, stop.lat, frac);
      const pingLng = interpolate(fromLng, stop.lng, frac);
      await apiFetch('/api/v1/location', {
        method: 'POST',
        token,
        body: { lat: pingLat, lng: pingLng, routeId, heading: 45, speedKmh: 20 },
      }).catch(() => {});
      await sleep(100);
    }
    console.log(`  gps: 5 pings sent`);

    // 3c. Confidence check (best-effort, stopId may not exist in DB)
    try {
      const confResp = await apiFetch(`/api/v1/stops/${stop.id}/confidence?vehicleId=${VEHICLE_ID}`, { token });
      const { summary, confidence } = confResp.data ?? {};
      console.log(`  confidence: ${summary} (${confidence})`);
    } catch {
      console.log(`  confidence: skipped (stop not in DB)`);
    }

    // 3d. Complete or fail stop (80/20 split)
    const succeed = Math.random() < 0.8;
    if (succeed) {
      syncQueue.push({
        endpoint: `/api/v1/stops/${stop.id}/complete`,
        method: 'POST',
        body: { completedAt: Date.now(), note: 'Simulated delivery' },
      });
      console.log(`  result: COMPLETED (queued for sync)`);
    } else {
      syncQueue.push({
        endpoint: `/api/v1/stops/${stop.id}/fail`,
        method: 'POST',
        body: { reason: 'Customer not home (simulated)', failedAt: Date.now() },
      });
      console.log(`  result: FAILED (queued for sync)`);
    }

    fromLat = stop.lat;
    fromLng = stop.lng;
  }

  // 4. Flush sync queue
  const flushResp = await apiFetch('/api/v1/sync/flush', {
    method: 'POST',
    token,
    body: { items: syncQueue },
  });
  const { succeeded, failed } = flushResp.data ?? {};
  console.log(`\n[simulate-shift] Sync flush: ${succeeded} succeeded, ${failed} failed`);

  // 5. Welfare check safety event
  await apiFetch('/api/v1/safety/event', {
    method: 'POST',
    token,
    body: {
      type:     'WELFARE_CHECK',
      severity: 'LOW',
      note:     'End-of-shift welfare check (simulated)',
      routeId,
    },
  });
  console.log(`[simulate-shift] Welfare check safety event sent`);

  console.log(`\n[simulate-shift] ✓ Shift simulation complete — routeId=${routeId}`);
}

main().catch(err => {
  console.error('[simulate-shift] FATAL:', err.message);
  process.exit(1);
});
