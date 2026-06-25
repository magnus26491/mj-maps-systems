# Service Audit — MJ Maps Systems

**Generated:** Stage 1 consolidation  
**Method:** Static import tracing from `services/api/server.ts` → all transitive imports

A service is **WIRED** if it appears in the import chain reachable from `services/api/server.ts`.
A service is **ORPHANED-INTENDED** if it contains real logic but is not wired.
A service is **STUB** if it is empty or a duplicate.

---

## WIRED Services (in the API request path)

These services are imported (directly or transitively) from the live Fastify server.

| Service | Role | Imported By |
|---------|------|-------------|
| `services/api` | Fastify server, all route handlers | entrypoint |
| `services/auth` | JWT authentication, user management | `services/api/routes/auth.ts` |
| `services/billing` | Subscription gating, plan management | `services/api/middleware/auth.ts` |
| `services/bridge-engine` | OSM bridge/restriction data | `services/route-engine/src/` |
| `services/cache` | Redis caching layer | `services/api/routes/*.ts` |
| `services/cluster-engine` | Side-of-road grouping, haversine | `services/route-engine/src/` |
| `services/db` | PostgreSQL pool, typed query helpers | `services/api/`, `services/route-engine/` |
| `services/notifications` | FCM push, ETA SMS (Twilio) | `services/api/driver-api.ts` |
| `services/osm` | Overpass API client, OSM data fetching | `services/turn-engine/src/` |
| `services/osm-client` | OSM HTTP client wrapper | `services/turn-engine/src/` |
| `services/property-engine` | Stop intelligence, access notes | `services/api/driver-api.ts` |
| `services/route-engine` | Anti-backtrack sweep optimiser, dynamic replan | `services/api/driver-api.ts` |
| `services/route-graph-solver` | Graph-based route solver | `services/route-engine/src/` |
| `services/stop-precision` | Stop pin precision helpers | `services/route-engine/src/` |
| `services/storage` | S3/R2 POD photo upload | `services/api/routes/pod.ts` |
| `services/telegram` | Telegram bot notifications | `services/notifications/` |
| `services/turn-engine` | Vehicle turn-around scoring, enrichment | `services/api/server.ts`, `services/api/driver-api.ts` |
| `services/workload` | Shift workload scoring | `services/api/driver-api.ts` |

---

## ORPHANED-INTENDED Services (in `services/_incubator/`)

These services contain real implementation but are **not wired into the API**.
They are preserved for promotion in later stages.

| Service | Description | Target Stage |
|---------|-------------|-------------|
| `access-engine` | Access route calculation | Future |
| `arrival-intelligence` | ETA and arrival prediction | Stage 2+ |
| `confidence-explanation` | Human-readable confidence descriptions | Stage 6 |
| `delivery-copilot` | AI delivery assistant | Future |
| `delivery-intake` | Stop/parcel intake and scanning | Future |
| `delivery-learning` | ML delivery outcome learning | Future |
| `delivery-prediction` | Delivery outcome prediction | Future |
| `driver-guardian` | Driver safety monitoring | Future |
| `driver-memory` | Per-driver learned preferences | Future |
| `driver-profile-intelligence` | Driver behaviour analysis | Future |
| `dynamic-replan-standalone` | Standalone replan engine (superseded by `route-engine/dynamic-replan.ts`) | N/A — superseded |
| `event-intelligence` | Traffic events (roadworks, incidents) | Stage 2 |
| `external-road-data` | External road data ingestion | Stage 2 |
| `intelligence-confidence` | Confidence scoring framework | Stage 6 |
| `live-traffic-intelligence` | Real-time traffic data | Stage 2 |
| `navigation-control` | Navigation state machine | Stage 5 |
| `navigation-events` | Navigation event bus | Stage 5 |
| `navigation-guard` | Navigation safety checks | Stage 5+6 |
| `navigation-learning` | Navigation pattern learning | Future |
| `parking-engine` | Parking location intelligence | Stage 3+ |
| `pin-resolver` | Address pin resolution | Stage 3 (superseded by geocoding) |
| `platform-health` | Extended platform health monitoring | Future |
| `postcode-resolver` | Postcode-to-coordinate resolution | Stage 3 |
| `railway` | Railway deployment helpers | Superseded by `railway.toml` |
| `road-closure-engine` | Road closure detection | Stage 2+ |
| `route-completion` | Route completion detection | Stage 5 |
| `route-optimizer` | Alternative VRP optimizer | Stage 2 (will be replaced by OR-Tools) |
| `sync-queue` | Offline sync queue | Stage 7 |
| `telemetry` | Driver telemetry collection | Stage 7+ |
| `traffic-engine` | Traffic model engine | Stage 2 |
| `trolley-advisory` | Trolley/sack-truck advisory | Future |
| `vehicle-intelligence` | Vehicle capability intelligence | Stage 6 |
| `weather-intelligence` | Weather impact on routing | Future |

---

## Legacy Bootstraps (in `legacy/`)

These are retired server bootstrap files. Not built. Not deployed. Reference only.

| Path | Description |
|------|-------------|
| `legacy/src/server.ts` | Express + WebSocket + Redis server (port 3100) |
| `legacy/api/index.ts` | Legacy Express API with PAF/plan routes |
| `legacy/startup.sh` | Startup script that ran migrations inline |

---

## Validation

To confirm the WIRED list is accurate, run:

```bash
npx tsc --noEmit          # must pass
npm run validate-production  # must show server boots and health returns 200
```

To promote an incubated service to WIRED:
1. Import it from a wired service (route, middleware, or handler)
2. Add tests that exercise the code
3. Update this document — change ORPHANED-INTENDED to WIRED
4. If needed, add the directory to `tsconfig.json` include
