# AGENTS.md — MJ Maps Systems: Full Agent Context

> Read this file before touching any code. It describes what the codebase does,
> the exact state of every known TypeScript error, the four-sprint feature plan,
> and the precise changes needed to go green on the next build.

---

## 1. What This Codebase Does

**mj-maps-systems** is a delivery-route intelligence platform for UK courier drivers.
It runs as a set of TypeScript microservices behind a Fastify API and a React-Native
mobile app (not in this repo). Core capabilities:

| Service | What it does |
|---|---|
| `services/api/server.ts` | Fastify entry point — REST + WebSocket |
| `services/osm/road-enricher.ts` | Enriches every stop: pin resolution → OSM road context → turn score → cluster decision |
| `services/property-engine/src/resolver.ts` | Geocodes addresses via Geoapify → postcode centroid fallback |
| `services/route-engine/` | Sequences stops: graph solver → anti-backtrack → side-of-road grouping → 2-opt |
| `services/turn-engine/` | Scores road width vs vehicle turning radius; emits GREEN/AMBER/RED alerts |
| `services/cluster-engine/` | Detects walk clusters (≥2 nearby stops); scores walk-vs-drive decision |
| `services/bridge-engine/` | Queries OSM for bridge clearance + weight restrictions |
| `services/dynamic-replan/` | Mid-shift replanning triggered by driver deviation, skip, or new stop |
| `services/cache/index.ts` | Redis wrapper — road segments (24h), pins (7d), community scores (1h), routes (30min) |
| `services/railway/darwin-client.ts` | RTT API client — predicts level-crossing closures |
| `packages/vehicle-profiles/` | Vehicle specs + `computeTurnScore` + `getBridgeAlert` — shared across all services |
| `api/build-planned-route.ts` | End-to-end orchestration example (setback → optimize → enrich) |

### Tech stack
- TypeScript, `"moduleResolution": "Node16"`, `"module": "Node20"`
- Fastify 4 + `@fastify/jwt`, `@fastify/websocket`, `@fastify/rate-limit`
- ioredis, node-postgres
- Build: `tsc` (no bundler) — Railway Docker build

---

## 2. Current Build Status

**Build: ✅ PASSING (as of 409872c)**

The following fixes were applied to make `tsc` pass:
1. Import paths in `api/build-planned-route.ts` fixed (was pointing to wrong paths)
2. React Native packages excluded from Node.js tsconfig (offline-cache, sync-queue, driver-app)
3. Type annotations added to `services/postcode-resolver/index.ts` for API responses

### Confirmed already-correct files (do not re-edit)
- `services/osm-client/index.ts` — exports `fetchRoadsNear`, `getBestRoadSegment`,
  `RoadSegment` (alias for `OsmRoadSegment`) ✅
- `services/cache/index.ts` — imports `RoadSegment` from `../osm-client` ✅
- `services/bridge-engine/src/osm-restrictions.ts` — exports `fetchRestrictionsForSegment` ✅
- `services/dynamic-replan/src/replan-engine.ts` — exports `isDeviated` ✅
- `services/route-engine/src/sequencer.ts` — exports `sequenceStops` (alias of `runSequencer`) ✅
- `services/route-engine/src/solver.ts` — all relative imports use `.js` extensions ✅
- `services/osm/road-enricher.ts` — `EnrichedStop` has all required fields; `resolveApproach` called with 4 args ✅
- `services/property-engine/src/resolver.ts` — uses Geoapify (not Nominatim); fully typed ✅
- `services/railway/darwin-client.ts` — `data.services` typed as `{ services?: any[] }` ✅
- `services/api/server.ts` — top-level awaits are inside `async function start()` ✅

---

## 3. Four-Sprint Feature Plan

These sprints implement the geo-accuracy upgrade agreed on 7 Jun 2026.
**Build is now green (Sprint 0 complete).** All sprints are ready to proceed.

---

### Sprint 0 — Fix the build ✅ DONE
All build errors resolved as of commit `409872c`.

---

### Sprint 1 — Swap geocoding layer: Nominatim → Geoapify (already done in resolver.ts)
`services/property-engine/src/resolver.ts` already uses Geoapify.
The remaining Sprint 1 tasks are:

**1a. Add Redis geocache wrapper in `resolver.ts`**
Wrap `resolveAddress()` with a Redis cache: key = normalised address string
(lowercase, trimmed, spaces collapsed), TTL = 7,776,000 seconds (90 days).

```ts
// In resolver.ts, at the top:
import { getCachedPin, setCachedPin } from '../../cache/index';

// In resolveAddress(), before calling Geoapify:
const normalised = req.rawAddress.toLowerCase().replace(/\s+/g, ' ').trim();
const cached = await getCachedPin(normalised);
if (cached) return { primary: cached as unknown as PropertyPin, alternatives: [], resolvedIn: 0 };

// After a successful resolve, before returning:
await setCachedPin(normalised, result.primary as unknown as StopPin);
```

Note: `StopPin` and `PropertyPin` share the same lat/lng/confidence shape — cast is safe.

**1b. Add env var to Railway**
```
GEOAPIFY_API_KEY=<key from geoapify.com free tier>
```

---

### Sprint 2 — Plus Codes on every stop

**2a. Install dependency**
```bash
npm install open-location-code
```
Add to `package.json` dependencies (not devDependencies).

**2b. Encode Plus Code after pin resolution**

In `services/pin-resolver/index.ts` (or wherever `batchResolvePins` writes the
`.pin` field), after each stop's `.pin` is set:

```ts
import { encode } from 'open-location-code';

// After pin is resolved:
stop.plusCode = encode(stop.pin.lat, stop.pin.lng, 11); // 11 = ~3m accuracy
```

Add `plusCode?: string` to the `PinResolveInput` interface and to `EnrichedStop`
(via the `StopPoint` base interface in `road-enricher.ts`).

**2c. Expose in API response**
`enrichRoute()` already spreads the full stop onto `EnrichedStop`. No further change
needed — `plusCode` will appear in the JSON automatically once the field is set.

**2d. Driver app (React Native — separate repo)**
Show the Plus Code below the address as a tappable link:
```
geo:0,0?q=<plusCode>
```
This opens Google Maps, Apple Maps, or any app that handles `geo:` URIs, which all
natively support Plus Codes.

---

### Sprint 3 — Map tiles: MapLibre GL + OpenFreeMap

**Target:** React Native driver app (separate repo). Notes here for the API side.

**3a. No API changes needed for tile serving** — tiles are fetched client-side
directly from `https://tiles.openfreemap.org/styles/liberty`.

**3b. New API field: `approachBearing`**
Drivers need a direction arrow on the map for the recommended approach.
`road-enricher.ts` already computes `incomingBearing` but does not expose it.

Add to `EnrichedStop.turn`:
```ts
approachBearing: number; // degrees 0=N, already computed as incomingBearing
```

In the `if (road)` block in `enrichRoute`:
```ts
turn = {
  ...turn,
  approachBearing: incomingBearing,
};
```

Update the `turn` type definition accordingly.

---

### Sprint 4 — Driver pin confirm loop

**4a. New endpoint**
```
POST /api/v1/stops/:stopId/confirm-pin
Body: { confirmed: boolean, correctedLat?: number, correctedLng?: number }
Auth: Bearer JWT (driver token)
```

**4b. Schema**
Add to Postgres (migration file `migrations/006_pin_verification.sql`):
```sql
ALTER TABLE stops
  ADD COLUMN pin_verified       BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN pin_verify_count   SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN pin_corrected_lat  DOUBLE PRECISION,
  ADD COLUMN pin_corrected_lng  DOUBLE PRECISION,
  ADD COLUMN pin_verified_at    TIMESTAMPTZ;
```

**4c. Logic in the route handler**
```
1. Load stop from DB, verify driverId matches the assigned route
2. If confirmed = true AND correctedLat/Lng provided:
     UPDATE stops SET pin_corrected_lat = $lat, pin_corrected_lng = $lng WHERE id = $stopId
3. INCREMENT pin_verify_count
4. If pin_verify_count >= 3:
     SET pin_verified = true
     Invalidate Redis pin cache for this address (call invalidatePinCache(address))
5. Return 204 No Content
```

**4d. Use verified pin in resolver**
At the top of `resolveAddress()` (before the Redis cache check), add a DB lookup:
```ts
// Pseudo-code — use your existing pg pool
const verified = await db.query(
  'SELECT pin_corrected_lat AS lat, pin_corrected_lng AS lng FROM stops WHERE normalised_address = $1 AND pin_verified = TRUE LIMIT 1',
  [normalised]
);
if (verified.rows.length > 0) {
  return {
    primary: { lat: verified.rows[0].lat, lng: verified.rows[0].lng, confidence: 'HIGH', source: 'community_verified', ... },
    alternatives: [],
    resolvedIn: 0,
  };
}
```

This means each address only ever gets geocoded once via Geoapify — after 3 driver
confirmations it uses the crowd-sourced ground truth forever.

---

## 4. Codebase Map (key paths)

```
mj-maps-systems/
├── api/
│   ├── build-planned-route.ts   ← NEEDS IMPORT FIX (Sprint 0)
│   └── index.ts
├── services/
│   ├── api/server.ts            ← Fastify entry point
│   ├── osm/
│   │   ├── road-enricher.ts     ← Main enrichment orchestrator
│   │   └── overpass-client.ts   ← Overpass API wrapper
│   ├── osm-client/index.ts      ← Re-export shim (do not rename exports)
│   ├── property-engine/
│   │   └── src/
│   │       ├── resolver.ts      ← Geoapify geocoder (Sprint 1 cache goes here)
│   │       ├── setback-engine.ts
│   │       └── types.ts
│   ├── pin-resolver/
│   │   ├── index.ts             ← batchResolvePins (Sprint 2 Plus Code goes here)
│   │   └── coords-fetcher.ts
│   ├── route-engine/src/
│   │   ├── route-planner.ts
│   │   ├── sequencer.ts         ← exports sequenceStops alias
│   │   ├── solver.ts            ← uses .js extensions on relative imports
│   │   └── types.ts
│   ├── turn-engine/
│   │   ├── index.ts
│   │   └── src/
│   │       ├── approach-side.ts ← resolveApproach(scoreResult, vehicle, roadWidthM, opts)
│   │       ├── enrichment-pipeline.ts
│   │       └── types.ts         ← OsmRoadSegment
│   ├── cluster-engine/index.ts
│   ├── bridge-engine/src/
│   │   ├── index.ts
│   │   └── osm-restrictions.ts  ← exports fetchRestrictionsForSegment
│   ├── dynamic-replan/src/
│   │   ├── index.ts
│   │   └── replan-engine.ts     ← exports isDeviated
│   ├── cache/index.ts           ← Redis wrapper
│   ├── railway/darwin-client.ts ← RTT level-crossing predictions
│   ├── route-optimizer/index.ts
│   └── route-graph-solver/solver.ts
└── packages/
    └── vehicle-profiles/index.ts ← computeTurnScore, getBridgeAlert, VEHICLE_PROFILES
```

---

## 5. Environment Variables Required

| Variable | Used by | Notes |
|---|---|---|
| `GEOAPIFY_API_KEY` | `property-engine/resolver.ts` | Free tier: 3k req/day |
| `REDIS_URL` | `services/cache/index.ts` | Default: `redis://localhost:6379` |
| `DATABASE_URL` | `services/api/server.ts` | Postgres connection string |
| `JWT_SECRET` | `services/api/server.ts` | Fastify JWT |
| `RTT_API_USER` / `RTT_API_PASS` | `services/railway/darwin-client.ts` | Real-Time Trains API |
| `OVERPASS_URL` | `services/osm/overpass-client.ts` | Optional: override public endpoint |

---

## 6. Key Invariants — Do Not Break

1. **`services/osm-client/index.ts` export names must stay stable** — `fetchRoadsNear`,
   `getBestRoadSegment`, `RoadSegment` are consumed by `turn-engine/index.ts` and
   `cache/index.ts`. Renaming breaks those consumers.

2. **`resolveApproach` signature:** `(scoreResult, vehicle, roadWidthM, opts)` — 4 args.
   Do not call it with 1 arg.

3. **`EnrichedStop` must extend `StopPoint`** — `StopPoint.id` is required. Any new
   fields added to `StopPoint` must have a value supplied in the `enrichRoute` map.

4. **`moduleResolution: Node16`** — all relative imports in `.ts` files that are
   compiled as ESM must use `.js` extensions (the compiled output filename, not `.ts`).
   Files already fixed: `solver.ts`. If you add new relative imports in ESM files,
   use `.js` extensions.

5. **No top-level await in CommonJS files.** `server.ts` wraps startup in
   `async function start()`. Keep it that way.

6. **Redis cache keys** — do not change key formats in `cache/index.ts` without
   flushing Redis, or stale data with the old shape will be deserialized into new types.

---

## 7. Agent Execution Notes

- Run `npm run build` (which runs `tsc`) to verify. Do not use `ts-node` to test.
- Do not run `npm install` unless explicitly adding a new package (Sprint 2).
- Do not reformat files with a linter unless the task explicitly asks for it.
- Commit each sprint as a separate commit with the message format shown in each sprint.
- tsconfig.json excludes React Native packages (offline-cache, sync-queue, driver-app, apps/*) from the Node.js build.
