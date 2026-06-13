#!/bin/sh
set -e
echo "[startup] Running migrations..."
node dist/services/db/migrate.js
echo "[startup] Migrations complete. Starting API server..."
exec node dist/api/index.js