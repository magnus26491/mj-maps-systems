# Services Incubator — Quarantined

> **⚠️ NOT wired into the API. NOT production-validated. NOT shipped in dist/.**

This directory contains services that were built in earlier phases but are **not**
imported by `services/api/server.ts` (the sole Fastify production server). They
are preserved here for three reasons:

1. They contain real, potentially valuable logic that may be promoted into the
   request path in future stages.
2. Their tests can be run independently with `ts-node <file>` or the service's
   own build tooling.
3. Deleting them would break git history and any future reference.

## Classification

These are **ORPHANED-INTENDED**: real implementation, not wired, not production-tested.
Several will be re-integrated in later stages (see the sprint plan in AGENTS.md).

## What IS Wired (Request Path)

```
services/api/server.ts
  → services/api/routes/...
  → services/api/driver-api.ts
      → services/route-engine
      → services/property-engine
      → services/turn-engine
      → services/notifications
      → services/db
      → services/cache
      → services/storage
      → services/workload
      → services/osm / services/osm-client
      → services/pin-resolver
      → services/postcode-resolver
      → services/route-completion
      → services/route-optimizer
      → services/stop-precision
      → services/bridge-engine
      → services/cluster-engine
      → services/traffic-engine
      → services/dynamic-replan
      → services/auth
      → services/billing
```

## Currently Quarantined (27 services)

| Service | What it does | Why orphaned |
|---|---|---|
| `access-engine/` | Road access restriction engine | Never imported by server |
| `arrival-intelligence/` | ETA and arrival prediction | Never imported by server |
| `confidence-explanation/` | Explains confidence scores | Never imported by server |
| `delivery-copilot/` | Delivery AI co-pilot | Never imported by server |
| `delivery-intake/` | Stop intake workflow | Never imported by server |
| `delivery-learning/` | Delivery outcome ML | Never imported by server |
| `delivery-prediction/` | Delivery success prediction | Never imported by server |
| `driver-guardian/` | Driver safety monitoring | Never imported by server |
| `driver-memory/` | Persistent driver session store | Never imported by server |
| `driver-profile-intelligence/` | Driver profile intelligence | Never imported by server |
| `event-intelligence/` | Event detection intelligence | Never imported by server |
| `external-road-data/` | External road data aggregation | Never imported by server |
| `intelligence-confidence/` | Confidence scoring system | Never imported by server |
| `live-traffic-intelligence/` | Real-time traffic intelligence | Never imported by server |
| `navigation-control/` | Navigation control system | Never imported by server |
| `navigation-events/` | Navigation event tracking | Never imported by server |
| `navigation-guard/` | Navigation safety guard | Never imported by server |
| `navigation-learning/` | Navigation learning system | Never imported by server |
| `parking-engine/` | Parking spot detection | Never imported by server |
| `platform-health/` | Platform health monitoring | Never imported by server |
| `railway/` | Railway integration (Darwin/Network Rail) | Never imported by server |
| `road-closure-engine/` | Road closure detection | Never imported by server |
| `sync-queue/` | Sync queue for offline support | Never imported by server |
| `telemetry/` | Service telemetry/metrics | Never imported by server |
| `trolley-advisory/` | Trolley route advisory | Never imported by server |
| `vehicle-intelligence/` | Vehicle intelligence system | Never imported by server |
| `weather-intelligence/` | Weather impact on routes | Never imported by server |

## Promoting a Service

To bring a quarantined service back into the request path:

1. Import it from a route handler or `driver-api.ts` (e.g., `import { ... } from '../_incubator/my-service'`)
2. Remove it from this directory
3. Add it to `tsconfig.json` include
4. Run `npm run build` to confirm it compiles
5. Add a test that actually calls the new route
6. Update this README and `docs/SERVICE_AUDIT.md`

## Excluded from Production Build

`services/_incubator/**` is in `tsconfig.json`'s `exclude` list. The Docker image
does NOT ship these. They exist only in source form on the host.

## Running Tests for Incubator Services

Each service may have its own test tooling. Check the service directory for a
`package.json` or test script.
