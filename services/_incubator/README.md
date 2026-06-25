# services/_incubator — Quarantined / Unwired Services

These services contain real implementation but are **NOT wired into the API request path**.
They are quarantined here rather than deleted so the logic is preserved and discoverable.

**None of these services are imported by `services/api/server.ts` or anything it imports.**
They do not run in production. They have not been production-validated.

## How to promote a service

1. Wire it into the API (add imports, routes, or call-sites in the request path).
2. Add tests that actually run the code (not just check file existence).
3. Update `docs/SERVICE_AUDIT.md` to mark it as `WIRED`.
4. Move the directory back to `services/` and add it to `tsconfig.json` include if needed.

## Services

| Service | Description | Intended Stage |
|---------|-------------|----------------|
| `access-engine` | Access route calculation | Future |
| `arrival-intelligence` | ETA and arrival prediction | Stage 2+ |
| `confidence-explanation` | Human-readable confidence descriptions | Stage 6 |
| `delivery-copilot` | AI delivery assistant | Future |
| `delivery-intake` | Stop/parcel intake and scanning | Future |
| `delivery-learning` | ML delivery outcome learning | Future |
| `delivery-prediction` | Delivery outcome prediction | Future |
| `driver-guardian` | Driver safety monitoring | Future |
| `driver-memory` | Per-driver learned preferences | Future |
| `driver-profile-intelligence` | Driver behaviour analysis | Future |
| `event-intelligence` | Traffic events (roadworks, incidents) | Stage 2 |
| `external-road-data` | External road data ingestion | Stage 2 |
| `intelligence-confidence` | Confidence scoring framework | Stage 6 |
| `live-traffic-intelligence` | Real-time traffic data | Stage 2 |
| `navigation-control` | Navigation state machine | Stage 5 |
| `navigation-events` | Navigation event bus | Stage 5 |
| `navigation-guard` | Navigation safety checks | Stage 5+6 |
| `navigation-learning` | Navigation pattern learning | Future |
| `parking-engine` | Parking location intelligence | Stage 3+ |
| `pin-resolver` | Address pin resolution (superseded by geocoding) | Stage 3 |
| `platform-health` | Extended platform health monitoring | Future |
| `postcode-resolver` | Postcode-to-coordinate resolution | Stage 3 |
| `railway` | Railway deployment helpers | Superseded by railway.toml |
| `road-closure-engine` | Road closure detection | Stage 2+ |
| `route-completion` | Route completion detection | Stage 5 |
| `route-optimizer` | Alternative VRP optimizer | Stage 2 (replaced by OR-Tools) |
| `sync-queue` | Offline sync queue | Stage 7 |
| `telemetry` | Driver telemetry collection | Stage 7+ |
| `traffic-engine` | Traffic model engine | Stage 2 |
| `trolley-advisory` | Trolley/sack-truck advisory | Future |
| `vehicle-intelligence` | Vehicle capability intelligence | Stage 6 |
| `weather-intelligence` | Weather impact on routing | Future |
