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

**Build: ✅ PASSING (as of 05bdd9e, Phase 9)**

The following fixes were applied to make `tsc` pass:
1. Import paths in `api/build-planned-route.ts` fixed (was pointing to wrong paths)
2. React Native packages excluded from Node.js tsconfig (offline-cache, sync-queue, driver-app)
3. Type annotations added to `services/postcode-resolver/index.ts` for API responses

**Known pre-existing TypeScript errors (not introduced by Phase 9):**
- `apps/driver-app/app/shift-start.tsx(376)`: duplicate `multiline` attribute (Phase 8 source)
- `apps/driver-app/app/stop-delivery.tsx`: `stops` field on `Shift` type mismatch
- `apps/driver-app/app/vehicle-select.tsx(30)`: wrong arg count to `useVehicleStore`
- `apps/driver-app/features/delivery/*.tsx`: `TextStyles` JSX type errors
- `apps/driver-app/components/*.tsx`: accessibility role type errors
- Test files: missing `@testing-library/react-hooks`

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

## Phase 9 — Plans, Registration, Billing, Feature Gates (committed 05bdd9e)

**Plan system:** `free` | `pro` | `enterprise` — stored in `drivers.plan`, loaded into JWT and returned in login response.

**Feature gates** (`lib/usePlan.ts`): `canUse(feature)` — Pro-gated features include `saved_routes`, `paf_lookup`, `csv_import`, `route_optimise`, `dark_mode`, `pod_capture`, `driving_mode_lock`, `live_activity`. Enterprise-only: `fleet_dispatch`, `dispatcher_dashboard`, `route_assignment`, `fleet_tracking`, `fleet_analytics`, `pod_export`, `bulk_stop_upload`, `time_windows`, `priority_stops`, `custom_pod_branding`, `multi_depot`, `admin_panel`.

**New API routes** (all under `api/routes/`):
- `auth-register.ts`: `POST /api/v1/auth/register` — bcrypt hash, 14-day trial, idempotent by email
- `billing.ts`: `POST /api/v1/billing/checkout` (auth), `GET /api/v1/billing/status` (auth), `POST /api/v1/billing/webhook` (Stripe sig)
- `auth.ts` login response now includes `planId` and `trialEndsAt`

**New driver-app files** (all under `apps/driver-app/`):
- `lib/usePlan.ts`: `usePlan()` hook + `getPlan()` standalone selector
- `lib/savedRoutes.ts`: SQLite CRUD for saved-route persistence
- `components/PlanGate.tsx`: upgrade prompt component
- `app/(auth)/plans.tsx`: pricing page (Pro £9.99 + Enterprise)
- `app/(auth)/register.tsx`: self-registration form + auto-checkout
- `app/index.tsx`: unauthenticated → `/plans` redirect
- `app/shift-start.tsx`: saved-routes button (Pro gate) + trial banner (≤3 days left)

---

## Phase 10 — Navigation, Voice, Vehicle Specs & Saved Routes (committed XXXXXX)

### API changes

**Sprint 1 (already done before Phase 10):** Redis 90-day geocache on `resolveAddress()` in `services/property-engine/src/resolver.ts`.

**Sprint 2 (already done before Phase 10):** Plus Codes via `open-location-code` — `applyPinToStop()` in `services/pin-resolver/index.ts` encodes every resolved pin.

**Sprint 3 (already done before Phase 10):** `approachBearing: incomingBearing` added to the `turn` object in `services/osm/road-enricher.ts`.

**Sprint 4 (new):**
- `migrations/006_pin_verification.sql`: adds `pin_verified`, `pin_verify_count`, `pin_corrected_lat`, `pin_corrected_lng`, `pin_verified_at`, `normalised_address` columns to `stops` table
- `api/routes/pin-confirm.ts`: `POST /api/v1/stops/:stopId/confirm-pin` — driver pin confirmation loop, 3 confirmations → verified → Redis cache invalidated
- `services/property-engine/src/resolver.ts`: DB verified-pin lookup at top of `resolveAddress()` — community ground truth from `stops` table overrides all automated sources
- `services/property-engine/src/types.ts`: added `'community_verified'` to `PropertyPin.source` union
- `api/routes/vehicle-specs.ts`: `GET /api/v1/vehicle-specs` — returns all vehicle specs from DB with snake_case → camelCase mapping
- `api/index.ts`: registered both new routes at `/api/v1/stops` and `/api/v1/vehicle-specs`

### Driver app changes

**`app/vehicle-select.tsx` (full rebuild):**
- Loads specs from `GET /api/v1/vehicle-specs` on mount
- Falls back to `FALLBACK_SPECS` (4 vans) if API unavailable
- Cards show: make model + year, height/weight/length icons
- Stores `profileKey` (e.g. `TRANSIT_LWB_GB`) in shift store — what the optimiser uses

**`lib/navigation.ts` (new):**
- `fetchNavRoute()`, `formatDistance()`, `formatDuration()`, `maneuverArrow()` exported

**`hooks/useNavigation.ts` (new):**
- `useNavigation()` hook — fetches route from Geoapify, tracks GPS, advances step at 30m, speaks at 200m via `expo-speech`

**`app/navigation.tsx` (new):**
- Full turn-by-turn screen launched from HUD or stop-delivery
- Shows `MapView` with polyline + destination marker
- Instruction banner with arrow + distance (green urgent when < 50m)
- "🔊 Repeat" and "✓ Arrived" action buttons
- "Open in Google Maps" escape hatch on error

**`app/hud.tsx` (updated):**
- Added "🗺 Navigate →" button to stop card (height 52, blue)
- Added "Open in Google Maps ↗" text link below address

**`app/saved-routes.tsx` (new):**
- Lists saved routes from SQLite, loads into staged stops, delete with confirmation

**`app/route-builder.tsx` (updated):**
- Added "💾" save button in header (shown when stops > 0)
- Save modal with TextInput, saves to SQLite via `saveRoute()`
- 10-route limit enforced on Pro plan (Enterprise: unlimited)

**`.env.example`:** Added `GEOAPIFY_API_KEY` and `EXPO_PUBLIC_GEOAPIFY_KEY` entries.

---

## Phase 12 — Dispatcher Dashboard Web App (committed XXXXXX)

### API changes

**`services/db/auth-helpers.ts`:** `getDriverById()` now includes `plan` column in SELECT
(`COALESCE(plan, 'free') AS plan`). Updated return type to include `plan: string`.

**`api/middleware/authenticate.ts`:** `req.driver` interface extended with `planId: string`.
Middleware sets `planId: driver.plan ?? 'free'` when populating `req.driver`.

**`api/middleware/requireEnterprise.ts` (new):** Guards enterprise-only routes. Checks
`req.driver.planId !== 'enterprise'` -> returns 403 with `code: 'ENTERPRISE_REQUIRED'`.
Must be used AFTER `authenticateDriver` (uses `req.driver.planId`).

**`api/routes/dispatcher-assign.ts` (new):** `dispatcherAssignRouter` with two routes:
- `POST /api/dispatcher/assign` — UUID validation for routeId + driverId, checks route
  status = 'active', checks driver exists + active, inserts into `route_assignments`,
  broadcasts live alert via `broadcastAlert()`, returns 201 with assignment record.
- `GET /api/dispatcher/drivers` — Returns pro/enterprise active drivers for the
  assign dropdown. Uses `requireEnterprise` middleware.

**`api/routes/dispatcher.ts`:** `/alerts/stream` (SSE) now authenticates via
`req.query.token` (EventSource cannot send Authorization headers). Calls
`verifyAccessToken(token)` — 401 if missing or invalid. Import added at top of file.

**`api/index.ts`:** `dispatcherAssignRouter` registered at `/api/dispatcher` alongside
`dispatcherRouter` (both under `authenticateDriver, requireRole('dispatcher')` guard).
`requireEnterprise` applied inside router handlers for per-endpoint control.

**`migrations/007_dispatcher_assignments.sql` (new):** `route_assignments` table with
`route_id`, `driver_id`, `assigned_by`, `assigned_at`, `note`, `status` columns. Indexes
on `driver_id` and `route_id`.

### Dispatcher Dashboard Web App

**`apps/dispatcher-dashboard/`** — Standalone Vite + React + TypeScript app (port 5173 dev).

Key files: `src/api.ts`, `src/types.ts`, `src/hooks/useAlerts.ts` (SSE + polling fallback),
`src/hooks/useStats.ts`, `src/hooks/useRoutes.ts`, `src/hooks/useDrivers.ts`,
`src/pages/Login.tsx`, `src/pages/Dashboard.tsx`, `src/components/FleetMap.tsx` (CartoDB
dark tiles + fixed marker icons), `src/components/KpiBar.tsx`, `src/components/AlertPanel.tsx`,
`src/components/RouteList.tsx`, `src/components/AssignModal.tsx` (shows "Enterprise plan
required" on 403/empty drivers).




## Phase 13 — Live Fleet Tracking (committed XXXXXX)

### Backend

**`migrations/008_driver_locations.sql` (new):** `driver_locations` table with PRIMARY KEY
on `driver_id` (one row per driver, upserted on each ping). Columns: `driver_id`, `route_id`,
`lat`, `lng`, `heading`, `speed_kmh`, `recorded_at`. Index on `route_id`.

**`api/routes/location.ts` (new):** `locationRouter` — POST / handler:
- Validates lat (-90..90) and lng (-180..180), returns 400 on invalid
- Uses `req.driver.id` (NOT `req.user`)
- Upserts `driver_locations` table with ON CONFLICT DO UPDATE
- Mirrors to Redis key `driver:loc:{driverId}` with 60s TTL (non-fatal on Redis failure)
- Returns 204 No Content

**`api/index.ts`:** Registered `locationRouter` at `/api/v1/location` with a separate
`locationLimiter` (300 req/min, above the 200 req/min `apiLimiter`). Must be mounted
BEFORE the 404 handler.

**`api/routes/dispatcher.ts`:** GET /routes now batch-reads live locations from Redis:
1. Collects all `driverId` values from DB rows
2. Calls `redis.mget(...keys)` where keys are `driver:loc:{id}`
3. Falls back to `currentLat: 0, currentLon: 0, lastPing: null` on Redis error
4. `lastPing` now allows null (was hardcoded to `new Date().toISOString()`)

### Dispatcher Dashboard

**`apps/dispatcher-dashboard/src/api.ts`:** Added `getLocationStreamUrl()` returning
`/api/dispatcher/locations/stream?token={token}` (Phase 14 SSE-ready hook point).

**`apps/dispatcher-dashboard/src/hooks/useRoutes.ts`:** `refreshInterval` changed from
15_000 to 10_000 (same cadence as driver GPS pings).

**`apps/dispatcher-dashboard/src/components/FleetMap.tsx`:** Complete rewrite:
- Removed declarative `<Marker>` JSX (caused re-render flicker)
- Added `<LiveMarkers routes={routes} />` component inside `<MapContainer>`
- Uses `useMap()` + imperative `L.marker()` + `markersRef` Map
- `markersRef.current.get(id)!.setLatLng(pos).setIcon(icon)` updates in-place
- Stale markers removed on routeId no longer present
- `makeIcon(status)` — DivIcon with colour: green (<30s), amber (30s-120s), grey (>120s/offline)
- `timeAgo()` helper for "Last seen: Xs ago" popup text
- Popup shows driverName, vehicleLabel, completed/total stops, lastSeen, heading

**`apps/dispatcher-dashboard/src/types.ts`:** `Route.lastPing` changed to `string | null`.




## Phase 14 — Driver Location SSE Stream (committed XXXXXX)

### Backend

**`services/cache/index.ts`:** Added `createSubscriber(): Redis` factory function.
Creates a separate ioredis instance for pub/sub use cases. The shared `redis` export
must never be subscribed — ioredis disallows normal commands on a subscribed client.

**`api/routes/location.ts`:** Added `redis.publish('fleet:locations', ...)` call after
the `setex` write. Both `setex` and `publish` are fire-and-forget — neither is awaited.
`res.status(204).end()` fires before both so the response never waits on Redis.
The published payload: `{ driverId, lat, lng, heading, speedKmh, routeId, recordedAt }`.

**`api/routes/dispatcher.ts`:** Added `GET /api/dispatcher/locations/stream` SSE endpoint:
- Auth via `req.query.token` + `verifyAccessToken()` (identical to `/alerts/stream`)
- Sets SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
  `Connection: keep-alive`, `X-Accel-Buffering: no`
- On connect: calls `redis.keys('driver:loc:*')` → `redis.mget(...keys)` to build a
  snapshot; emits `event: snapshot\ndata: <JSON array>\n\n`
- Creates a subscriber via `createSubscriber()` (separate from shared `redis`)
- Subscribes to `fleet:locations` channel; on each message emits
  `event: location\ndata: <raw message string>\n\n`
- On `req.on('close')`: calls `subscriber.quit()` to release the connection
- GET /routes also updated: `locMap` now includes `heading` field; each route object
  includes `heading: loc?.heading ?? null` in its response

### Dispatcher Dashboard

**`apps/dispatcher-dashboard/src/types.ts`:** `Route.heading` added as `number | null`
(Phase 13 implied it via a cast — now explicitly typed).

**`apps/dispatcher-dashboard/src/hooks/useRoutes.ts`:** Complete rewrite replacing SWR
with an SSE-powered hook:
- Initial fetch via `getRoutes()` to populate full route metadata (driverName, stops, etc.)
- Opens `EventSource` to `getLocationStreamUrl()` (already in `src/api.ts`)
- `snapshot` event: merges all location fields (currentLat, currentLon, lastPing, heading)
  into matching routes by driverId — does not replace the route object
- `location` event: delta update — finds matching route by driverId, updates only the
  four location fields in-place
- `onerror` (which fires on disconnect too): closes EventSource, clears fallback interval,
  starts `setInterval` polling `getRoutes()` every 15_000ms
- Unmount: `es.close()` + `clearInterval` via `cleanup()` callback
- Return shape unchanged: `{ routes, isLoading, error }` — Dashboard.tsx and FleetMap.tsx
  require no changes

**`apps/dispatcher-dashboard/src/components/FleetMap.tsx`:** Two targeted changes:
- `makeIcon(status, heading)`: gains `heading: number | null` parameter. When heading is
  not null, CSS `transform: rotate(${heading}deg)` is applied to a `▲` arrow inside the
  DivIcon. Icon size 16×16 (was 14×14) with centred arrow.
- Popup heading: `Heading: ${Math.round(heading)}° ${bearingToCompass(heading)}` (or
  "Unknown" when null) appended after "Last seen: Xs ago"
- `bearingToCompass(deg: number): string` helper returns 8-point compass label
  (N, NE, E, SE, S, SW, W, NW) from a bearing in degrees
- `makeIcon` called with `route.heading` (typed `number | null` from Route interface)


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
