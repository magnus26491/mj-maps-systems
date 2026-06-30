#!/bin/sh
# MJ Maps - Container startup script
# Migrations run as a Railway PRE-DEPLOY step (see railway.toml).
# This script: diagnostics + server start only.
#
# Railway:  GET /api/v1/health -> 200 when server is listening
# Railway:  preDeployCommand = "node dist/services/db/migrate.js"

set -e  # Exit immediately on any command failure

echo ""
echo "[mj-maps-api] ================================================"
echo "[mj-maps-api]   MJ Maps Systems - Startup Diagnostics"
echo "[mj-maps-api] ================================================"
echo "[mj-maps-api] Timestamp:   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "[mj-maps-api] NODE_ENV:    ${NODE_ENV:-unset}"
echo "[mj-maps-api] PORT:       ${PORT:-3000}"
echo "[mj-maps-api] BUILD_ID:    ${BUILD_ID:-unset}"
echo ""
echo "[mj-maps-api] --- Required secrets ---"
if [ -n "$JWT_SECRET" ]; then
  echo "[mj-maps-api] JWT_SECRET:  SET"
else
  echo "[mj-maps-api] JWT_SECRET:  NOT SET (fails in production if NODE_ENV=production)"
fi
if [ -n "$DATABASE_URL" ]; then
  echo "[mj-maps-api] DATABASE:    DATABASE_URL SET"
elif [ -n "$POSTGRES_URL" ]; then
  echo "[mj-maps-api] DATABASE:    POSTGRES_URL SET (legacy)"
else
  echo "[mj-maps-api] DATABASE:    NOT SET - required for all DB routes + migrations"
fi
echo ""
echo "[mj-maps-api] --- Optional services ---"
echo "[mj-maps-api] REDIS:       $(if [ -n "$REDIS_URL" ]; then echo 'SET'; else echo 'not set (graceful degradation - no cache)'; fi)"
echo "[mj-maps-api] IDEALPC:     $(if [ -n "$IDEAL_POSTCODES_KEY" ]; then echo 'SET (fast Royal Mail PAF via Ideal Postcodes enabled)'; else echo 'not set (falling back to OS Places / OSM — slower)'; fi)"
echo "[mj-maps-api] OS_PLACES:   $(if [ -n "$OS_PLACES_KEY" ]; then echo 'SET (UPRN-level address lookup enabled)'; else echo 'not set (falling back to Nominatim - less accurate)'; fi)"
echo "[mj-maps-api] W3W:         $(if [ -n "$WHAT3WORDS_API_KEY" ]; then echo 'SET'; else echo 'not set (what3words door pins disabled)'; fi)"
echo "[mj-maps-api] GEOAPIFY:    $(if [ -n "$GEOAPIFY_API_KEY" ]; then echo 'SET'; else echo 'not set (geocoding falls back to basic mode)'; fi)"
echo "[mj-maps-api] R2:          $(if [ -n "$R2_ENDPOINT" ]; then echo 'SET'; else echo 'not set (POD uploads will fail)'; fi)"
echo ""
echo "[mj-maps-api] --- Build artifacts ---"

# FATAL: server binary must exist before attempting to start
if [ ! -f "dist/services/api/server.js" ]; then
  echo "[mj-maps-api] FATAL: dist/services/api/server.js not found!"
  echo "[mj-maps-api] The Docker build may have failed."
  exit 1
fi

echo "[mj-maps-api] server.js    OK"
if [ -d "dist/services/db/migrations" ]; then
  echo "[mj-maps-api] migrations  OK"
else
  echo "[mj-maps-api] migrations  MISSING (run migrations before starting server)"
fi

echo ""
echo "[mj-maps-api] ================================================"
echo "[mj-maps-api]   Launching API server on :${PORT:-3000}"
echo "[mj-maps-api] ================================================"
echo ""

# Brief pause so Railway healthcheck does not catch a half-initialised process
sleep 1

exec node dist/services/api/server.js
