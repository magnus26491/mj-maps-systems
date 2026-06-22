# Legacy — Retired Server Bootstraps

> **⚠️ NOT built. NOT deployed. NOT maintained.**

This directory holds decommissioned server entrypoints that are no longer part of
the running system. They are kept for reference only and must NOT be built,
imported, or started.

## Contents

| File | Status | Notes |
|---|---|---|
| `api-index.ts` | RETIRED | Legacy Express server (`port 3100`). Was used in early phases.<br>Superseded by `services/api/server.ts` (Fastify, port 3000).<br>Not referenced by any package.json script. Not built by Docker. |
| `src/server.ts` | RETIRED | Alternate Express+ws+Redis bootstrap.<br>Never reached production. Superseded by Fastify server.<br>Not referenced by any package.json script. |
| `startup.sh` | RETIRED | Startup script for the legacy Express server.<br>Superseded by `start.sh` which starts the Fastify server. |

## Why These Are Here

These files are retained for historical reference. They are **NOT** compiled
into `dist/` and are **NOT** started by Railway. The Docker image ships only
`dist/services/api/server.js` (Fastify).

## What Runs in Production

- **Entry point:** `services/api/server.ts` → `dist/services/api/server.js`
- **Port:** 3000 (configurable via `PORT` env var)
- **Framework:** Fastify 4
- **Start command:** `sh start.sh` (Docker) or `npm start`

## Removing These

These files should be deleted once no historical reference to them remains in
documentation or migration scripts.

## The `api/` Directory

The entire `api/` directory (routes, middleware, services) was the legacy Express
server ecosystem. It is now quarantined at `legacy/api/`. It is **NOT** imported
by `services/api/` (the Fastify server) and is **NOT** built or deployed.

Key routes that existed in the legacy Express server (now retired):
- All auth, billing, analytics, location, dispatcher, vehicle-specs routes
  (replaced by equivalent routes in `services/api/routes/`)
- PAF postcode lookup (`api/routes/paf.ts`)
- `/api/v1/stops/:id/confirm-pin` (replaced by `services/api/routes/confirm-pin.ts`)

The legacy Express server ran on port 3100 and was never the primary production
entrypoint. `services/api/server.ts` (Fastify, port 3000) is the sole live server.
