# Legacy — Retired Server Bootstraps

This directory contains server bootstrap code that predates the current Fastify architecture.
**None of these files are built, deployed, or part of the live system.**

The live server is `services/api/server.ts`, compiled to `dist/services/api/server.js`
and started by `start.sh`. See `railway.toml` for the deployment configuration.

## Contents

| Path | Description | Status |
|------|-------------|--------|
| `src/server.ts` | Express + WebSocket + Redis bootstrap (port 3100) | Retired |
| `api/index.ts` | Legacy Express API with PAF/plan routes | Retired |
| `startup.sh` | Alternate startup script that ran migrations inline | Retired |

## Why not deleted?

Git history is not a substitute for discoverability. These files preserve the architectural
context of earlier phases. They may be useful as reference when implementing features
(e.g., the Redis WebSocket pattern in src/server.ts).

Do not import from, build, or run these files. They are not maintained and will rot.
