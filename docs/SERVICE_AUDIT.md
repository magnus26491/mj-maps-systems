# Service Architecture Audit

> **Status: accurate as of Stage 1**

This document classifies every service in `services/` by whether it is in the
production request path. "Wired" means at least one file in the Fastify server's
import graph imports from the service.

## Legend

| Symbol | Meaning |
|---|---|
| ✅ WIRED | In the request path — compiled, deployed, tested |
| ⚠️ ORPHANED | Real logic, not wired — quarantined in `services/_incubator/` |

---

## WIRED Services (20)

These are transitively imported by `services/api/server.ts` → routes → handlers →
service logic. They are compiled into `dist/` and shipped in the Docker image.

### Core Engine
| Service | Import path | Used by |
|---|---|---|
| `services/route-engine/` | `../route-engine/route-engine` | `driver-api.ts` (optimise, replan) |
| `services/property-engine/` | `../property-engine/stop-intelligence` | `driver-api.ts` (intel) |
| `services/turn-engine/` | `../turn-engine/src/alert-dispatcher`, `src/resolver` | `driver-api.ts`, server routes |
| `services/osm/` | `../osm/road-enricher` | `turn-engine`, `route-engine` |
| `services/osm-client/` | `../osm-client` | `turn-engine`, `osm` |
| `services/pin-resolver/` | `../pin-resolver/index`, `coords-fetcher` | `osm/road-enricher` |
| `services/postcode-resolver/` | `../postcode-resolver/index` | `api/routes/pins.ts`, `plan.ts` |
| `services/route-optimizer/` | `../route-optimizer/index` | `api/routes/plan.ts` |
| `services/stop-precision/` | `../stop-precision` | `api/routes/plan.ts`, `stop-pin.ts` |
| `services/route-completion/` | `../route-completion` | `api/routes/stop-complete.ts`, `dispatcher.ts` |
| `services/dynamic-replan/` | `../route-engine/dynamic-replan` | `driver-api.ts` (events) |
| `services/bridge-engine/` | `../bridge-engine` | `osm/road-enricher` |
| `services/cluster-engine/` | `../cluster-engine/side-of-road-grouper` | `osm/road-enricher`, `route-engine/sequencer` |
| `services/traffic-engine/` | `../traffic-engine/index` | `route-optimizer`, `route-engine` |

### Data & Storage
| Service | Import path | Used by |
|---|---|---|
| `services/db/` | `../../db/index` | 16+ route files |
| `services/cache/` | `../../cache/index` | `location.ts`, `dispatcher.ts`, `pin-confirm.ts` |
| `services/storage/` | `../../storage/s3-client` | `api/routes/pod.ts` |

### Auth & Billing
| Service | Import path | Used by |
|---|---|---|
| `services/auth/` | `../../auth/index` | `middleware/auth.ts`, `routes/auth.ts` |
| `services/billing/` | `../../billing/subscription-guard` | `middleware/auth.ts` |

### Notifications & Utility
| Service | Import path | Used by |
|---|---|---|
| `services/notifications/` | `../notifications/eta-notifier`, `fcm-push` | `driver-api.ts` |
| `services/workload/` | `../workload/shift-load-scorer` | `driver-api.ts` |

### Packages
| Package | Import path | Used by |
|---|---|---|
| `packages/vehicle-profiles/` | `../../packages/vehicle-profiles` | `server.ts`, `turn-engine`, `bridge-engine` |
| `packages/subscription-engine/` | `../../packages/subscription-engine` | `server.ts` |
| `packages/vehicle-catalogue/` | `../../../packages/vehicle-catalogue` | `routes/vehicles.ts` |

---

## ORPHANED Services (27) → `services/_incubator/`

These services contain real implementation but are **not imported** by any file
in the Fastify request path. They are quarantined in `services/_incubator/` and
are **NOT compiled into `dist/`** or shipped in the Docker image.

| Service | Description | Reason orphaned |
|---|---|---|
| `access-engine/` | Road access restriction engine | Never imported |
| `arrival-intelligence/` | ETA and arrival prediction | Never imported |
| `confidence-explanation/` | Confidence score explanations | Never imported |
| `delivery-copilot/` | Delivery AI co-pilot | Never imported |
| `delivery-intake/` | Stop intake workflow | Never imported |
| `delivery-learning/` | Delivery outcome ML | Never imported |
| `delivery-prediction/` | Delivery success prediction | Never imported |
| `driver-guardian/` | Driver safety monitoring | Never imported |
| `driver-memory/` | Persistent driver session store | Never imported |
| `driver-profile-intelligence/` | Driver profile intelligence | Never imported |
| `event-intelligence/` | Event detection intelligence | Never imported |
| `external-road-data/` | External road data aggregation | Never imported |
| `intelligence-confidence/` | Confidence scoring system | Never imported |
| `live-traffic-intelligence/` | Real-time traffic intelligence | Never imported |
| `navigation-control/` | Navigation control system | Never imported |
| `navigation-events/` | Navigation event tracking | Never imported |
| `navigation-guard/` | Navigation safety guard | Never imported |
| `navigation-learning/` | Navigation learning system | Never imported |
| `parking-engine/` | Parking spot detection | Never imported |
| `platform-health/` | Platform health monitoring | Never imported |
| `railway/` | Railway integration (Darwin/Network Rail) | Never imported |
| `road-closure-engine/` | Road closure detection | Never imported |
| `sync-queue/` | Sync queue for offline support | Never imported |
| `telemetry/` | Service telemetry/metrics | Never imported |
| `trolley-advisory/` | Trolley route advisory | Never imported |
| `vehicle-intelligence/` | Vehicle intelligence system | Never imported |
| `weather-intelligence/` | Weather impact on routes | Never imported |

---

## Legacy Bootstrap (Quarantined → `legacy/`)

| File | Status | Notes |
|---|---|---|
| `legacy/api-index.ts` | RETIRED | Legacy Express server. Superseded by Fastify server. |
| `legacy/server.ts` | RETIRED | Alternate Express+ws+Redis bootstrap. Never reached prod. |
| `legacy/startup.sh` | RETIRED | Startup for legacy Express. Superseded by `start.sh`. |
| `legacy/api/` | RETIRED | Full Express route ecosystem. Not imported by Fastify server. |

---

## Database Migrations

There are **two** migration directories. The authoritative one is:

- `services/db/migrations/` — numbered `000`–`020`, copied into Docker at build time

The root `migrations/` directory (006–017) is an **orphan** — it is NOT read by the
migration runner. It should be removed or clearly marked as superseded.

---

## Request Path Summary

```
HTTP Request
    ↓
services/api/server.ts          ← sole entrypoint (Fastify, port 3000)
    ↓
services/api/routes/            ← 14 route files
services/api/middleware/        ← auth, feature gates
services/api/driver-api.ts      ← core request handlers
    ↓
services/
  route-engine/    ✅  →  route-optimizer/, traffic-engine/, cluster-engine/
  property-engine/ ✅  →  postcode-resolver/
  turn-engine/     ✅  →  osm/, osm-client/, bridge-engine/, cluster-engine/
  pin-resolver/    ✅  →  (no further deps)
  stop-precision/  ✅  →  (no further deps)
  route-completion/ ✅  →  db/
  dynamic-replan/  ✅  →  traffic-engine/
  db/              ✅  ←  16+ route files import pool
  cache/           ✅  ←  redis client
  storage/         ✅  ←  S3/R2 client
  notifications/   ✅  ←  FCM, Telegram
  workload/        ✅  ←  shift scoring
  auth/            ✅  ←  JWT, password hashing
  billing/         ✅  ←  subscription features
packages/
  vehicle-profiles/ ✅  ←  shared vehicle specs
  subscription-engine/ ✅  ←  plan feature gates
  vehicle-catalogue/ ✅  ←  vehicle data
```

---

## No Longer in Production

- ❌ `src/server.ts` — was Express+ws+Redis bootstrap; never production
- ❌ `api/` (old) — was legacy Express server; superseded by `services/api/`
- ❌ `startup.sh` — superseded by `start.sh`
- ❌ All 27 incubator services — not wired, not deployed
