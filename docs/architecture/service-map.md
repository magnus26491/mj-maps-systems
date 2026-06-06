# MJ Maps — Service Architecture Map

## Service Ports

| Service | Port | Responsibility |
|---|---|---|
| `route-engine` | 3002 | Orchestrator — builds full enriched route |
| `turn-engine` | 3003 | Vehicle turn-feasibility scoring |
| `route-optimizer` | 3004 | TSP optimisation — nearest-neighbour + 2-opt + sweep zones |
| `property-engine` | 3005 | UK address geocoding, exact pins, access notes |
| `access-engine` | 3006 | Last-50-metres approach instruction generation |
| `osm` | 3007 | OpenStreetMap road geometry fetcher (Overpass API) |
| `notifications` | 3008 | Telegram + push driver alerts |
| `traffic-engine` | 3009 | Live traffic via TomTom/HERE, ETA adjustment |
| `cluster-engine` | 3010 | Stop sweep-zone clustering for anti-backtracking |

## Request Flow — Single Stop Build

```
Driver App
    │
    ▼
POST /route/build  (route-engine:3002)
    │
    ├─ POST /property/geocode × N  (property-engine:3005)
    │      └─ OS AddressBase API → exact lat/lon pin
    │
    ├─ GET  /osm/road?lat=&lon=    (osm:3007)
    │      └─ Overpass API → road width, height/weight limits
    │
    ├─ POST /turn/score            (turn-engine:3003)
    │      └─ computeTurnScore() → GREEN / AMBER / RED
    │
    ├─ POST /route/optimise        (route-optimizer:3004)
    │      └─ nearest-neighbour → 2-opt → sweep-zones
    │
    └─ POST /notify/driver         (notifications:3008)
           └─ Telegram alert for RED turn warnings
```

## Turn Score Pipeline Detail

```
 roadWidthM (OSM)          vehicleProfile
      │                          │
      ▼                          ▼
 widthRatio = roadWidthM / minRoadWidthTurn
      │
      + turningHeadBonus (+0.30 if head >= vehicle.minTurningHeadDiamM)
      × deadEndPenalty   (×0.50 if dead-end < 2 × vehicleLength)
      │
      hard override: height restriction OR weight limit → score = 0
      │
      blend: 60% geometry + 40% communityScore (if available)
      │
      ▼
 score ≥ 0.75  →  GREEN  — clear entry
 score 0.40..0.74  →  AMBER  — warn at 300m
 score < 0.40  →  RED    —  block at 500m, reroute
```

## Environment Variables Required

```env
# OS AddressBase (property-engine)
OS_API_KEY=

# TomTom (traffic-engine — primary)
TOMTOM_API_KEY=

# HERE (traffic-engine — fallback)
HERE_API_KEY=

# Telegram (notifications)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Overpass (osm-engine — default is public instance)
OVERPASS_URL=https://overpass-api.de/api/interpreter

# Service URLs (for route-engine orchestration)
PROPERTY_ENGINE_URL=http://localhost:3005
OSM_ENGINE_URL=http://localhost:3007
TURN_ENGINE_URL=http://localhost:3003
OPTIMIZER_URL=http://localhost:3004
```

## Key Algorithms

### Route Optimisation
1. **Nearest-Neighbour** seed — O(n²) construction heuristic
2. **2-Opt swap** improvement — reduces crossings, typically cuts 10-25% distance
3. **Sweep Zone anti-backtrack** — DBSCAN-style radius clustering, forces neighbourhood completion before moving to next zone

### Turn Feasibility
- Based on vehicle turning circle physics and kerb-to-kerb road width
- Community telemetry blended at 40% weight when ≥3 driver reports exist
- Hard overrides for legal restrictions (height, weight) always win

### Property Precision
- OS AddressBase preferred (1m accuracy, UPRN-level)
- Postcodes.io fallback (postcode centroid, ~±150m)
- Driver pin overrides stored in PostgreSQL, applied immediately
- Access notes crowdsourced from delivery outcomes
