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
## Phase 15 — Proof of Delivery (POD) Capture (committed XXXXXX)

### Backend

**`migrations/009_pod.sql` (new):** Adds `pod_url` (TEXT), `pod_type` (TEXT CHECK IN
('photo','signature')), `pod_captured_at` (TIMESTAMPTZ) columns to the `stops` table.
No new table — POD is stored directly on the stop row.

**`services/storage/s3-client.ts`:** Updated env var names from `POD_S3_*` to `R2_*`
(`R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
Added `uploadPod(driverId, stopId, buffer, mimeType)` function that uploads directly to
R2/S3 and returns the public CDN URL (`{CDN_BASE}/pod/{driverId}/{stopId}-{timestamp}.{ext}`).
Cache-Control header set to `public, max-age=31536000, immutable` for CDN caching.
File extension derived from `mimeType`: `image/png` → `png`, anything else → `jpg`.

**`services/storage/index.ts` (new):** Re-exports `uploadPod` and `s3Configured` from
`s3-client.ts` as the public API surface for `api/routes/pod.ts`.

**`api/routes/pod.ts` (new):** `podRouter` with one endpoint:
- `POST /api/v1/stops/:stopId/pod` — multipart/form-data upload, field name `photo`.
  Uses `multer.memoryStorage()` (never writes to disk). 5 MB file size limit enforced
  at the multer level. Only `image/jpeg` and `image/png` accepted — 400 for anything else.
  Validates stop belongs to the authenticated driver's active route (404 if not found,
  403 if driver_id mismatch). Calls `uploadPod()` after validation. Updates `stops` table:
  `pod_url`, `pod_type = 'photo'`, `pod_captured_at = NOW()`. Returns 201 `{ success: true,
  podUrl }`. Global error handler catches multer file-too-large and invalid MIME type
  errors, returning 400 with the error message.

**`api/routes/dispatcher.ts`:** Added `GET /api/dispatcher/stops/:stopId/pod`:
- `requireEnterprise` middleware gates the endpoint (403 `ENTERPRISE_REQUIRED` if plan is
  not enterprise)
- Queries `pod_url`, `pod_type`, `pod_captured_at` from `stops` table
- Returns 404 if stop not found or `pod_url` is null
- Returns `{ success: true, podUrl, podType, podCapturedAt }` on success

**`api/index.ts`:** Imported `podRouter` from `./routes/pod`. Mounted at
`/api/v1/stops` alongside `pinConfirmRouter` (same prefix, different routes).

### Dispatcher Dashboard

**`apps/dispatcher-dashboard/src/types.ts`:** Added `Stop` interface with `id`, `address`,
`status: 'pending' | 'delivered' | 'failed'`, `podUrl: string | null`, `podCapturedAt: string | null`.
Updated `Route.stops` from `unknown[]` to `Stop[]`.

**`apps/dispatcher-dashboard/src/api.ts`:** Added `apiFetch()` helper for consistent
error handling (parses JSON, throws on non-2xx, extracts `code: 'ENTERPRISE_REQUIRED'` from
403 responses). Added `getStopPod(stopId)` which calls `/api/dispatcher/stops/${stopId}/pod`
and returns `{ podUrl, podType, podCapturedAt }`.

**`apps/dispatcher-dashboard/src/components/PodModal.tsx` (new):**
- Props: `stopId: string | null`, `onClose: () => void`
- When `stopId` is not null, fetches `getStopPod(stopId)` on mount via `useEffect`
- Shows loading spinner while fetching
- On success: renders POD image full-width (`maxWidth: 100%`, `maxHeight: 70vh`) with
  capture timestamp below ("Captured: {date}")
- On 403/ENTERPRISE_REQUIRED: shows "Enterprise plan required" in red error box
- On 404: shows "No proof of delivery captured for this stop." in red error box
- Close button (`×`) in top-right corner, click on backdrop also calls `onClose`
- Renders nothing when `stopId` is null (conditional return)

**`apps/dispatcher-dashboard/src/components/RouteList.tsx`:** Complete rewrite:
- Added expandable stop rows (▶/▼ toggle) with `useState` for `expandedRoutes` Set
- Expanded section shows stop list with status dot (green=delivered, red=failed,
  amber=pending) and 📷 button for stops with `podUrl`
- Clicking 📷 opens `PodModal` with that stop's ID (`selectedStopId` state)
- `PodModal` rendered at bottom of component with `onClose={() => setSelectedStopId(null)}`
- Imports `useState` from React and `PodModal` from `./PodModal`

### Configuration

**`.env.example`:** Added R2 storage section with `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET=mj-maps-pod`, `R2_PUBLIC_URL=https://pod.mj-maps.com`.
Comments explain that R2 is S3-compatible and that API tokens are created in the
Cloudflare R2 dashboard.

**`package.json`:** Added `multer@^1.4.5-lts.1` to dependencies, `@types/multer@^1.4.11`
to devDependencies. `@aws-sdk/client-s3` was already present.



## Phase 16 — Route Analytics & End-of-Shift Report (committed XXXXXX)

### Backend

**`migrations/010_route_analytics.sql` (new):** Adds `finished_at` (TIMESTAMPTZ),
`actual_distance_km` (NUMERIC(8,2)), and `on_time` (BOOLEAN) columns to the `routes`
table. Creates partial index `idx_routes_finished_at` on `finished_at DESC WHERE
finished_at IS NOT NULL` for analytics date-range queries.

**`api/routes/analytics.ts`:** Route analytics and end-of-shift report endpoints.
All routes require `authenticateDriver + requireRole('dispatcher') + requireEnterprise`
applied at mount point (NOT re-applied inside this file):
- `GET /api/dispatcher/analytics/routes` — paginated route summaries. Query params:
  `from`/`to` (ISO strings, defaults: 7 days ago → now), `driverId` (optional),
  `limit` (default 20, clamped to 100 via `Math.min`). Invalid `from`/`to` dates
  return 400. Uses `COUNT ... FILTER (WHERE ...)` for `podCount`, `redAlerts`,
  `amberAlerts`. Returns `{ ok: true, routes: [...] }`.
- `GET /api/dispatcher/analytics/routes/:routeId` — stop-level breakdown. Returns
  404 `{ success: false, error: 'Route not found.' }` if route absent. Returns
  `{ ok: true, route: {...}, stops: [...] }`.
- `GET /api/dispatcher/analytics/summary` — fleet KPIs for current UTC day. Uses
  `COALESCE(SUM(...), 0)::int` for stop counts. `podCaptureRate` and `onTimeRate`
  computed in SQL with `NULLIF(..., 0)` to guard division-by-zero. `avgCompletionMins`
  computed as `EXTRACT(EPOCH FROM AVG(finished_at - shift_start)) / 60`. Returns
  `{ ok: true, completedRoutes, activeRoutes, totalStopsDelivered, totalStopsFailed,
  podCaptureRate, onTimeRate, avgCompletionMins, redAlertCount, amberAlertCount }`.

**`api/index.ts`:** `analyticsRouter` imported and registered at `/api/dispatcher`
with `authenticateDriver, requireRole('dispatcher'), requireEnterprise` middleware
applied at mount. Mounted after `dispatcherRouter` and `dispatcherAssignRouter`.

### Dispatcher Dashboard

**`apps/dispatcher-dashboard/src/types.ts`:** Added `RouteAnalyticsSummary`,
`StopAnalyticsRow`, and `AnalyticsSummary` interfaces.

**`apps/dispatcher-dashboard/src/api.ts`:** Added `getAnalyticsRoutes(params)`,
`getAnalyticsRoute(routeId)`, and `getAnalyticsSummary()` functions. All three call
`apiFetch()` and validate `response.ok` before returning. `getAnalyticsRoutes` builds
query string from params using URLSearchParams. `apiFetch()` helper extracts
`ENTERPRISE_REQUIRED` code from 403 responses.

**`apps/dispatcher-dashboard/src/hooks/useAnalytics.ts` (new):** Hook that fetches
`getAnalyticsSummary()` and `getAnalyticsRoutes({ limit: 20 })` in parallel via
`Promise.all`. Returns `{ summary, routes, isLoading, error }`.

**`apps/dispatcher-dashboard/src/components/AnalyticsPanel.tsx` (new):** Self-contained
panel that fetches its own data via `useAnalytics()`. Layout:
- Top section: 2×2 KPI cards (Routes completed, Delivery success rate, POD capture
  rate, On-time rate) — dark theme with `#0f172a` background, `#1e293b` border.
- Bottom section: Route history table (last 20 routes) with columns: Driver,
  Stops, Failed, Alerts, POD, Status, Shift. Clicking any row opens `RouteDetailModal`.
- Loading state: "Loading analytics..." in `#64748b`.
- Enterprise gate: amber box with "Fleet analytics require an Enterprise plan." when
  error contains `ENTERPRISE_REQUIRED`.

**`apps/dispatcher-dashboard/src/components/RouteDetailModal.tsx` (new):** Modal
showing stop-level breakdown for a single route. Props: `routeId: string | null`,
`onClose: () => void`. Fetches `getAnalyticsRoute(routeId)` on mount. Layout:
- Title: "Route Detail — {driverName}"
- Summary row: vehicle, distance, shift start → finished, on-time badge
- Stop list table: Address | Status (dot: green/delivered, red/failed, amber/pending)
  | Alert (🔴/🟡/—) | POD (📷 if hasPod) | Time
- Uses same overlay/modal/closeBtn styles as `PodModal.tsx`.
- Backdrop click and × button both call `onClose`. Max width 800px.

**`apps/dispatcher-dashboard/src/pages/Dashboard.tsx`:** Added `rightTab` state
(`'alerts' | 'analytics' | 'drivers'`, default `'alerts'`). Tab bar renders
Alerts / Analytics / Drivers buttons above the panel. Active tab: background
`#1e3a5f`, color `#3b82f6`, border `#3b82f6`. Inactive: transparent, `#64748b`,
border `#1e293b`. Imports `AnalyticsPanel` from `../components/AnalyticsPanel`.
Renders `<AlertPanel />` when `rightTab === 'alerts'`, `<AnalyticsPanel />` when
`rightTab === 'analytics'`, `<DriversPanel />` when `rightTab === 'drivers'`.



## Phase 17 — Route Completion Engine (committed XXXXXX)

### Backend

**`services/route-completion/index.ts` (new):** Pure service function — no Express, no
HTTP. Exports `maybeCompleteRoute(routeId): Promise<boolean>`:
1. Loads route; returns `false` if not found or already `completed` (idempotency guard)
2. Queries live stop counts (delivered/failed/pending) — returns `false` if any `pending > 0`
3. Computes `finishedAt = NOW()`, `onTime = finishedAt <= estimated_completion` (null if
   no estimate), `actualDistanceKm` via haversine accumulation from `driver_locations`
   (falls back to `route.total_distance_km` if fewer than 2 GPS points)
4. `UPDATE routes SET status='completed', finished_at, on_time, actual_distance_km,
   completed_stops, failed_stops` — returns `true`
5. Full `try/catch` — never throws; logs errors to `console.error('[route-completion]', err)`

Haversine implementation is inline: `R = 6371`, all angles converted to radians,
distance rounded to 2 decimal places.

**`api/routes/stop-complete.ts` (new):** `stopCompleteRouter` for
`POST /api/v1/stops/:stopId/complete`:
- Validates `body.status` is `'delivered'` or `'failed'` → 400 otherwise
- Loads stop → 404 if not found; 403 if `driver_id !== req.driver.id`; 400 if
  `status !== 'pending'` (already actioned guard)
- Updates stop status inline
- Re-queries and stamps `completed_stops` and `failed_stops` on the parent route
- Calls `maybeCompleteRoute(routeId)` — if `true`, calls `broadcastAlert({ type:
  'route_completed', routeId, driverId, driverName: null, ts })`
- Returns `200 { success: true, routeCompleted: boolean }`
- `authenticateDriver` applied at the mount point — not re-applied here
- Imports `broadcastAlert` from `'../routes/dispatcher'`

**`api/routes/dispatcher.ts`:** Added `POST /api/dispatcher/routes/:routeId/complete`
endpoint (inserted after the GET /alerts polling route, before POST /alerts/:id/dismiss):
- Calls `maybeCompleteRoute(routeId)` directly
- Returns `409` if `false` ("Route already completed or not found.")
- Returns `200 { success: true }` if `true`, broadcasting `{ type: 'route_completed',
  routeId, manual: true, ts }` via `broadcastAlert()`
- Imports `maybeCompleteRoute` from `'../../services/route-completion'`

**`api/index.ts`:** Imported `stopCompleteRouter` from `'./routes/stop-complete'`.
Registered at `/api/v1/stops` alongside `pinConfirmRouter` and `podRouter`:
`app.use('/api/v1/stops', authenticateDriver, pinConfirmRouter, podRouter, stopCompleteRouter)`.
All three routers handle different sub-paths — no conflict.

### Dispatcher Dashboard

**`apps/dispatcher-dashboard/src/api.ts`:** Added `forceCompleteRoute(routeId)` — calls
`POST /api/dispatcher/routes/${routeId}/complete` via `apiFetch()`.

**`apps/dispatcher-dashboard/src/components/RouteList.tsx`:** Added `onComplete?: (routeId:
string) => void` prop. Added "✓ Complete" button (only when `route.status === 'active'`):
green outline style, `marginLeft: '0.5rem'`. `handleComplete()` calls
`forceCompleteRoute(routeId).then(() => onComplete?.(routeId)).catch(console.error)` —
calls `onComplete` only on API success, logs on error, never throws. Imports
`forceCompleteRoute` from `'../api'`.

**`apps/dispatcher-dashboard/src/pages/Dashboard.tsx`:** Passes `onComplete` prop to
`<RouteList>`: `onComplete={_routeId => { /* routes refresh via SSE */ }}`. No other
changes.



## Phase 18 — Driver Management (committed XXXXXX)

### Backend

**`migrations/011_driver_status.sql` (new):** Adds `is_active` (BOOLEAN NOT NULL DEFAULT
FALSE) and `last_seen_at` (TIMESTAMPTZ) columns to the `drivers` table. Also creates
`idx_drivers_is_active` — a partial index on `is_active` restricted to TRUE rows,
optimized for "find active drivers" queries.

**`api/routes/driver-management.ts` (new):** `driverManagementRouter` with four endpoints.
All require `authenticateDriver` + `requireRole('dispatcher')` applied at the mount
point — do NOT re-apply middleware inside this file:
- `GET /` — returns all drivers with live route context (activeRoutes, completedToday).
  Counts use `COUNT(...)::integer` casts to handle Postgres bigint returns.
- `GET /:driverId` — single driver + last 10 routes (ordered by shift_start DESC).
  Returns 404 if driver not found.
- `PATCH /:driverId` — dynamic SET clause built from allowlisted fields only
  (`name`, `email`, `role`). Validates role against `['driver', 'dispatcher', 'admin']`
  — 400 on invalid. Returns 400 "No valid fields to update." if none provided.
  Returns 404 if driver not found.
- `DELETE /:driverId` — checks for active routes first (409 if any), then deletes.
  Returns 404 if driver not found.

All four endpoints: full `try/catch`, `console.error('[driver-management]', err)`,
500 `{ success: false, error: 'Internal server error.' }`.

**`api/index.ts`:** Imported `driverManagementRouter` from `'./routes/driver-management'`.
Registered: `app.use('/api/dispatcher', authenticateDriver, requireRole('dispatcher'),
driverManagementRouter)` — placed immediately after the analytics mount. Mounts on the
same path prefix as `dispatcherRouter` and `dispatcherAssignRouter` — no route conflict
since each router handles its own sub-paths.

### Dispatcher Dashboard

**`apps/dispatcher-dashboard/src/types.ts`:** Added `DriverRow`, `DriverDetail`,
`DriverRouteRow` interfaces. `DriverRow` includes `activeRoutes` and `completedToday`
(counts from today's completed routes). `DriverRouteRow` mirrors analytics stop-row
style for route history.

**`apps/dispatcher-dashboard/src/api.ts`:** Added `getDispatcherDrivers()`,
`getDriver(driverId)`, `updateDriver(driverId, fields)`, `deleteDriver(driverId)`.
`getDispatcherDrivers` and `getDriver` use `apiFetch()`. `updateDriver` and `deleteDriver`
use raw `fetch` with error body parsing (same pattern as `forceCompleteRoute`).
Renamed the existing enterprise-gated `getDrivers()` function unchanged (used by
`AssignModal`).

**`apps/dispatcher-dashboard/src/hooks/useDrivers.ts`:** Replaced SWR implementation
with manual `useState` + `useEffect` pattern matching `useStats` / `useRoutes`. Uses
`refreshKey` counter state — `refresh()` increments it to trigger re-fetch. Cancels
in-flight requests via `cancelled` flag. Returns `{ drivers, isLoading, error, refresh }`.

**`apps/dispatcher-dashboard/src/components/DriversPanel.tsx` (new):**
- State: `editingId`, `editFields` (name/email/role), `savingId`, `deletingId`,
  `selectedDriverId`
- Table with 6 columns: Name/Email, Role, Status, Routes Today, Last Seen, Actions
- Name cell: clickable driver name opens `DriverDetailModal`; email in muted text below
- Role badge: green pill for `driver`, blue for `dispatcher`/`admin`
- Status: green dot if `isActive`, grey otherwise
- Edit mode: replaces Name/Email and Role cells with inputs (name input, email input,
  role `<select>`)
- Save/Cancel buttons (disabled + opacity while saving); Delete button (red, disabled
  while deleting)
- `handleSave()` and `handleDelete()` both call `refresh()` on success
- `DriversPanel` does NOT fetch directly — uses `useDrivers()` hook exclusively

**`apps/dispatcher-dashboard/src/components/DriverDetailModal.tsx` (new):**
- Fetches `getDriver(driverId)` on mount when `driverId` is not null; returns `null`
  immediately otherwise
- Title: "Driver — {driver.name}"
- Summary grid (4 cols): Email, Role, Status (dot + label), Last Seen
- Route history table (last 10): Date, Stops, Failed, Distance, On Time, Status
  (✓/✗/— with colour coding; status badge same as RouteList)
- Copied overlay/modal/closeBtn styles exactly from `RouteDetailModal.tsx` — no shared
  style module. Max width: 700px

**`apps/dispatcher-dashboard/src/pages/Dashboard.tsx`:** Added third tab button "Drivers"
matching existing style. `rightTab` type expanded to `'alerts' | 'analytics' | 'drivers'`.
Imported `DriversPanel` from `../components/DriversPanel`. Renders `<DriversPanel />`
when `rightTab === 'drivers'` (chained ternary: alerts → AlertPanel, analytics →
AnalyticsPanel, drivers → DriversPanel).



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
