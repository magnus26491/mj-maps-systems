# Alert API Endpoints

Two REST endpoints expose the turn-around intelligence pipeline to the driver app and dispatcher console.

## Authentication

Both endpoints require a valid JWT issued by `POST /api/v1/auth/token`.

```
Authorization: Bearer <token>
```

Tokens expire after **12 hours** (one shift + buffer). The driver app should refresh before each shift starts.

---

## `GET /api/v1/routes/:routeId/alerts`

Returns the **full pre-departure alert list** for a route. The driver app calls this once after route optimisation to build the nav overlay.

### Parameters

| Name | Location | Type | Required | Description |
|------|----------|------|----------|-------------|
| `routeId` | path | `string` | ✅ | Alphanumeric/hyphen/underscore, max 128 chars |

### Response `200`

```json
{
  "ok": true,
  "data": {
    "routeId": "route-abc123",
    "summary": {
      "blue":       12,
      "amber":       4,
      "red":         1,
      "impassable": ["Barn Farm Lane, Skipton, BD23 4QT"]
    },
    "events": [
      {
        "stopId":           "stop-07",
        "sequence":          7,
        "overlayColour":    "RED",
        "turnAroundMethod": "DO_NOT_ENTER",
        "triggerWaypoint":  { "lat": 53.9981, "lng": -2.0174 },
        "stopCoord":        { "lat": 54.0000, "lng": -2.0150 },
        "message":          "Do not enter — 7.5t cannot turn on this track",
        "enrichedAt":       1749290400000
      }
    ],
    "enrichedAt": 1749290400000
  },
  "durationMs": 4
}
```

### Alert overlay colours

| `overlayColour` | Meaning | Driver action |
|-----------------|---------|---------------|
| `BLUE` | Informational advisory | No action needed |
| `AMBER` | Caution — plan manoeuvre | Prepare to three-point or reverse |
| `RED` | Do not enter | Reroute or reassign stop |

### Turn-around methods

| `turnAroundMethod` | Description | Trigger distance |
|--------------------|-------------|------------------|
| `NOT_REQUIRED` | Road is wide enough — just drive | 0 m |
| `USE_TURNING_HEAD` | OSM turning circle confirmed ahead | 150 m |
| `FORWARD_TURN` | Clean U-turn possible | 150 m |
| `THREE_POINT` | Three-point turn required | 300 m |
| `REVERSE_OUT` | Dead end — reverse exit only | 500 m |
| `DO_NOT_ENTER` | No safe manoeuvre for this vehicle | 600 m |

### Error responses

| Status | Reason |
|--------|--------|
| `401` | Missing or expired JWT |
| `404` | `routeId` not found in enriched route store |
| `400` | Invalid `routeId` format |
| `429` | Rate limit exceeded (20 req/min per token) |

---

## `GET /api/v1/routes/:routeId/alerts/red`

Returns **only `DO_NOT_ENTER` stops** — used by the dispatcher console to flag vehicle-impassable addresses before the driver departs.

### Parameters

Same as `/alerts` above.

### Response `200`

```json
{
  "ok": true,
  "data": {
    "routeId":   "route-abc123",
    "redCount":  1,
    "impassable": ["Barn Farm Lane, Skipton, BD23 4QT"],
    "events": [
      {
        "stopId":           "stop-07",
        "sequence":          7,
        "overlayColour":    "RED",
        "turnAroundMethod": "DO_NOT_ENTER",
        "triggerWaypoint":  { "lat": 53.9981, "lng": -2.0174 },
        "stopCoord":        { "lat": 54.0000, "lng": -2.0150 },
        "message":          "Do not enter — 7.5t cannot turn on this track",
        "enrichedAt":       1749290400000
      }
    ]
  },
  "durationMs": 2
}
```

If `redCount === 0` the dispatcher console shows a green badge. If `redCount > 0` it surfaces each `impassable` address so the dispatcher can contact the driver or reassign the stop to a smaller vehicle before departure.

---

## Enriched route lifecycle

```
POST /routes/optimise
  → optimise stop order
  → enrich stops (OSM road geometry, turn scores, approach side)
  → setEnrichedRoute(routeId, enrichedStops)   ← stored in memory

GET /routes/:routeId/alerts       ← reads from enriched store
GET /routes/:routeId/alerts/red   ← reads from enriched store
```

Enriched routes are evicted after **14 hours** (shift + 2h margin). In production, the store will be backed by Redis with a matching TTL so multi-instance deployments share enrichment state.

---

## Driver app integration

The recommended call sequence on shift start:

```typescript
// 1. Optimise
const { data: route } = await api.post('/routes/optimise', { stops, config });

// 2. Fetch full alert list once and cache locally
const { data: alertData } = await api.get(`/routes/${route.routeId}/alerts`);

// 3. Build nav overlay
const overlay = buildOverlay(alertData.events);

// 4. As driver approaches each triggerWaypoint, fire the overlay
navEngine.on('waypointReached', (wp) => overlay.show(wp.stopId));
```

The dispatcher console calls `/alerts/red` before confirming dispatch:

```typescript
const { data } = await api.get(`/routes/${routeId}/alerts/red`);
if (data.redCount > 0) {
  dispatcher.flag(routeId, data.impassable);
}
```
