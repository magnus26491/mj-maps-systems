#!/bin/sh
# ── MJ Maps — Container startup script ─────────────────────────────────────────
# Migrations are run as a Railway PRE-DEPLOY step (see railway.toml).
# This script only runs diagnostics and starts the server.
#
# Railway healthcheck: GET /api/v1/health  → 200 when HTTP server is up
# Railway preDeployCommand: npm run migrate:prod

echo '[mj-maps-api] === STARTUP DIAGNOSTICS ==='
echo '[mj-maps-api] NODE_ENV='"$NODE_ENV"
echo '[mj-maps-api] PORT='"$PORT"
echo '[mj-maps-api] JWT_SECRET set='"$([ -n "$JWT_SECRET" ] && echo yes || echo NO)"
echo '[mj-maps-api] DATABASE_URL set='"$([ -n "$DATABASE_URL" ] && echo yes || echo NO)"
echo '[mj-maps-api] REDIS_URL set='"$([ -n "$REDIS_URL" ] && echo yes || echo NO)"
echo '[mj-maps-api] Checking dist/services/api/server.js exists...'
ls -lh dist/services/api/server.js \
  || { echo '[mj-maps-api] FATAL: server.js not found in dist!'; exit 1; }
echo '[mj-maps-api] === Launching server ==='
exec node dist/services/api/server.js
