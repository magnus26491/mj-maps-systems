# MJ Maps — Offline-First Architecture

## The Problem We Solved

Delm8 has zero offline capability. When signal drops (farms, rural lanes, basement car parks, inner-city dead zones) the app stops working entirely. Drivers cannot:
- See their remaining stops
- Mark a delivery complete
- Get turn warnings
- Access access notes

MJ Maps is **offline-first**. Everything the driver needs is written to the device at shift start. Signal is only required at two moments: shift start (fetch + cache) and periodically to sync completions back.

---

## Three-Layer Storage

```
┌─────────────────────────────────────────────────────┐
│  L1: Zustand (in-memory)                            │
│  ─ Instant reads, UI state, current stop, turn      │
│  ─ Cleared on app kill — always rebuilt from L2     │
├─────────────────────────────────────────────────────┤
│  L2: expo-sqlite (on-device SQLite)                 │
│  ─ Persists across app kills and reboots            │
│  ─ Full shift: stops, geocache, access notes, POD   │
│  ─ Sync queue: actions taken while offline          │
│  ─ Survives indefinitely with no network            │
├─────────────────────────────────────────────────────┤
│  L3: API + S3 (server)                              │
│  ─ Source of truth                                  │
│  ─ Synced to from L2 when signal returns            │
│  ─ POD photos uploaded via presigned S3 URL         │
└─────────────────────────────────────────────────────┘
```

---

## Shift Start Flow

```
Driver opens app
       │
       ▼
NetInfo.fetch()
       │
  ┌────┴────┐
  │ Online  │──→ GET /api/v1/routes/:shiftId
  └─────────┘         │
                      ▼
               Write to SQLite (L2)
               upsertStops()
               cacheShift()
               geocacheWrite() × N
                      │
                      ▼
               Load from L2 into Zustand (L1)
                      │
  ┌─────────┐         ▼
  │ Offline │──→ getStopsForShift() from L2
  └─────────┘    Show OfflineBanner in UI
```

---

## Delivery Complete Flow (Offline)

```
Driver taps "Complete"
       │
       ▼
markStopComplete(stopId, photoUri, sigUri)
       │
       ├─→ UPDATE stops SET status='COMPLETED' in SQLite
       │
       └─→ enqueueSync('/api/v1/stops/:id/complete', 'POST', {...})
                      │
                      ▼
             Signal returns (any time, even next day)
                      │
                      ▼
             AppState 'active' OR NetInfo reconnect
                      │
                      ▼
             flushSyncQueue() — sends all queued actions
                      │
                      ▼
             DELETE from sync_queue on 200 OK
             Retry up to 5× on failure
```

---

## What Works With Zero Signal

| Feature | Offline? | Notes |
|---|---|---|
| View all stops | ✅ | From SQLite |
| Turn warnings | ✅ | Computed from cached road data |
| Access notes | ✅ | Stored on stop record |
| Mark complete | ✅ | Written to SQLite, synced later |
| Mark failed + reason | ✅ | Same |
| POD photo capture | ✅ | Saved to device, uploaded on reconnect |
| POD signature | ✅ | Same |
| Map tiles (cached area) | ✅ | react-native-maps caches tiles |
| Address lookup (known) | ✅ | geocache SQLite table |
| Address lookup (new) | ❌ | Requires Geoapify API |
| Live replan | ❌ | Requires server |
| ETA updates | ❌ | Requires server |

---

## Geocache — The Compounding Advantage

Every successfully resolved address is stored in the local geocache indefinitely.
After 3 driver pin-confirmations it is marked `verified = true`.

Over time, the device builds a complete map of every address on the driver's
regular patch — most lookups never hit Geoapify at all, even online.
This is how we get to <1s stop resolution in areas with no OSM coverage.
