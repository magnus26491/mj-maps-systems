# OSM Overpass Integration

Fetches real road geometry data from OpenStreetMap to power all vehicle intelligence features.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      enrichRoute()                          │
│                    road-enricher.ts                         │
│                                                             │
│   getRoadContextBatch()    detectClusters()   computeTurn() │
│         │                       │                  │        │
│         ▼                       ▼                  ▼        │
│   overpass-client.ts    cluster-engine/     vehicle-profiles│
│         │                                                   │
│         ▼                                                   │
│   Overpass API (OSM)                                        │
└─────────────────────────────────────────────────────────────┘
```

## What Data Is Fetched

For every stop on a route, the Overpass client fetches:

| OSM Element | Tags Used | Powers |
|---|---|---|
| `way[highway=residential]` | `width`, `maxwidth`, `maxheight`, `oneway`, `access`, `surface` | Turn score, access check |
| `way[highway=service/track]` | Same as above | Farm/estate road scoring |
| `node[highway=turning_circle]` | Presence of node at road end | Turning head detection |
| `node[highway=turning_loop]` | Presence of node at road end | Turning head detection |
| `way[highway=footway/path/alley]` | `lit`, `access`, `steps` | Walk cluster cut-throughs |
| `node[railway=level_crossing]` | `crossing_barrier`, `crossing_light` | Darwin API station lookup |

## Road Width Heuristics

When OSM has no explicit `width` tag, widths are estimated from road class:

| Class | Estimated Width | Notes |
|---|---|---|
| `residential` | 5.0m | Standard UK residential |
| `living_street` | 4.0m | Shared space, very tight |
| `service` | 4.5m | Service/access roads |
| `track` | 3.5m | Farm/forest tracks |
| `unclassified` | 5.5m | Country lanes |
| `tertiary` | 6.5m | Busier local roads |

When an explicit `width` tag IS present, it overrides the heuristic.
`widthIsExplicit: true` is flagged on the road segment so the turn score
can apply a higher confidence weight.

## Batch Query Performance

For a 100-stop route:
- Individual queries: ~100 × 200ms = **20 seconds**
- Batch query (50 stops/batch): 2 × 800ms = **~1.6 seconds**

Always use `getRoadContextBatch()` for full routes.

## Overpass Endpoints (with fallback)

1. `OVERPASS_API_URL` env var (self-hosted — recommended for production)
2. `https://overpass-api.de/api/interpreter` (primary public)
3. `https://lz4.overpass-api.de/api/interpreter` (secondary public)
4. `https://overpass.kumi.systems/api/interpreter` (community mirror)

For production at scale, self-host using Docker:
```bash
docker run -e OVERPASS_META=no -e OVERPASS_MODE=clone \
  -e OVERPASS_DIFF_URL=https://planet.osm.org/replication/minute/ \
  -p 12345:80 wiktorn/overpass-api
```
Then set `OVERPASS_API_URL=http://localhost:12345/api/interpreter`.

## Environment Variables

```env
OVERPASS_API_URL=https://overpass-api.de/api/interpreter   # optional: self-hosted
```

## Usage

```typescript
import { enrichRoute } from './services/osm/road-enricher';
import { VEHICLE_PROFILES } from './packages/vehicle-profiles';

const result = await enrichRoute({
  stops: optimisedRoute,
  vehicle: VEHICLE_PROFILES.luton,
});

console.log(result.summary);
// {
//   totalStops: 94,
//   redTurnWarnings: 3,
//   amberTurnWarnings: 11,
//   walkClusters: 7,
//   walkTimeSavedMin: 52,
//   levelCrossings: 2,
//   enrichmentTimeMs: 1847
// }

// Access per-stop data:
result.stops.forEach(stop => {
  if (stop.turn?.alert === 'RED') {
    // Trigger alert 500m before stop
    scheduleAlert(stop, stop.turn.alertDistanceM, stop.turn.message);
  }
  if (stop.clusterResult?.decision === 'WALK') {
    // Show park-and-walk notification
    showClusterNotification(stop.clusterResult.notification);
  }
});
```
