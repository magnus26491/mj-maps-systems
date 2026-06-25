#!/bin/bash
##
## MJ Maps — OSM Data Preparation
##
## Downloads the Great Britain OSM extract from Geofabrik and pre-processes
## it for both OSRM and Valhalla. Run once before starting docker-compose.dev.yml.
##
## Requirements: docker (to run OSRM pre-processing containers)
## Time: ~15–25 minutes on first run (downloads ~1.4 GB)
## Disk: ~8 GB total (PBF + OSRM graphs + Valhalla tiles)
##
## Usage:
##   chmod +x scripts/prepare-osm.sh
##   ./scripts/prepare-osm.sh
##
## To use a different region (e.g. england-latest for faster iteration):
##   REGION=england-latest ./scripts/prepare-osm.sh
##

set -euo pipefail

REGION="${REGION:-great-britain-latest}"
GEOFABRIK_BASE="https://download.geofabrik.de/europe"
PBF_FILE="${REGION}.osm.pbf"
DATA_DIR="$(dirname "$0")/../data"

mkdir -p "${DATA_DIR}/osrm" "${DATA_DIR}/valhalla"

PBF_PATH="${DATA_DIR}/osrm/${PBF_FILE}"

# ── 1. Download PBF ────────────────────────────────────────────────────────────
if [ -f "${PBF_PATH}" ]; then
  echo "[prepare-osm] ${PBF_FILE} already exists — skipping download."
  echo "  Delete ${PBF_PATH} to force re-download."
else
  echo "[prepare-osm] Downloading ${REGION} OSM extract (~1.4 GB)…"
  curl -L --progress-bar -o "${PBF_PATH}" \
    "${GEOFABRIK_BASE}/${PBF_FILE}"
  echo "[prepare-osm] Download complete: $(du -sh "${PBF_PATH}" | cut -f1)"
fi

# ── 2. OSRM pre-processing ─────────────────────────────────────────────────────
OSRM_FILE="${DATA_DIR}/osrm/${REGION%.osm.pbf}.osrm"
if [ -f "${OSRM_FILE}" ]; then
  echo "[prepare-osm] OSRM graph already exists — skipping pre-processing."
else
  echo "[prepare-osm] Pre-processing OSRM graph (MLD algorithm)…"
  OSRM_IMAGE="ghcr.io/project-osrm/osrm-backend:v5.28.0"

  # Extract
  docker run --rm \
    -v "$(realpath "${DATA_DIR}/osrm"):/data" \
    "${OSRM_IMAGE}" \
    osrm-extract -p /opt/car.lua /data/${PBF_FILE}

  # Partition
  docker run --rm \
    -v "$(realpath "${DATA_DIR}/osrm"):/data" \
    "${OSRM_IMAGE}" \
    osrm-partition /data/${REGION%.osm.pbf}.osrm

  # Customize
  docker run --rm \
    -v "$(realpath "${DATA_DIR}/osrm"):/data" \
    "${OSRM_IMAGE}" \
    osrm-customize /data/${REGION%.osm.pbf}.osrm

  echo "[prepare-osm] OSRM pre-processing complete."
fi

# ── 3. Valhalla tile build ─────────────────────────────────────────────────────
VALHALLA_TILES="${DATA_DIR}/valhalla/valhalla_tiles"
if [ -d "${VALHALLA_TILES}" ]; then
  echo "[prepare-osm] Valhalla tiles already exist — skipping build."
else
  echo "[prepare-osm] Building Valhalla tiles (this takes ~10 min)…"
  cp "${PBF_PATH}" "${DATA_DIR}/valhalla/${PBF_FILE}"

  docker run --rm \
    -v "$(realpath "${DATA_DIR}/valhalla"):/custom_files" \
    -e "use_tiles_ignore_pbf=false" \
    -e "build_elevation=false" \
    -e "build_admins=true" \
    -e "build_time_zones=true" \
    ghcr.io/gis-ops/docker-valhalla/valhalla:latest \
    bash -c "valhalla_build_config --mjolnir-tile-dir /custom_files/valhalla_tiles \
      --mjolnir-timezone /custom_files/timezones.sqlite \
      --mjolnir-admin /custom_files/admins.sqlite > /custom_files/valhalla.json && \
      valhalla_build_tiles -c /custom_files/valhalla.json /custom_files/${PBF_FILE}"

  echo "[prepare-osm] Valhalla tile build complete."
fi

echo ""
echo "[prepare-osm] ✅ Done. Start the dev stack with:"
echo "  docker compose -f docker-compose.dev.yml up"
echo ""
echo "  Then set in .env:"
echo "  OSRM_URL=http://localhost:5000"
echo "  VALHALLA_URL=http://localhost:8002"
echo "  ROUTE_SOLVER_URL=http://localhost:8080"
