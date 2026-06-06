# Property Intelligence Engine

Covers two complementary problems:
1. **How far back is the property from the road** (setback-engine.ts)
2. **If it's a flat, which floor and is there a lift** (apartment-engine.ts)

Together they power realistic ETA estimates, park/walk decisions, and stop difficulty scoring.

---

## Setback Engine

Estimates how far the delivery point sits back from the nearest accessible road edge.

| `setbackFromRoadM` | `suggestedDropMode` | Typical example |
|---|---|---|
| 0–8m | `CURBSIDE` | Terraced house on road edge |
| 8–25m | `SHORT_WALK` | Detached house with front garden |
| 25–80m | `LONG_WALK` | Large suburban detached |
| 80m+ | `DRIVEWAY_APPROACH` | Rural farmhouse, gated estate |

### Upgrade path (Phase 2)
- Add building polygon query (`way[building]` from OSM)
- Project setback on actual road line segment rather than nearest node
- Driveway/path tracing
- Aerial inference for rural plots

---

## Apartment Engine

Solves the floor and lift problem for every flat/apartment stop.

### Floor Estimation

The engine supports all major UK apartment numbering conventions:

| Convention | Example | Floor result |
|---|---|---|
| Floor-prefixed (100s) | Flat 305 | 3rd floor |
| Sequential low (with fpf) | Flat 9 (4 per floor) | 2nd floor |
| Identifier prefix | GF1, LG3, B2 | Ground, Lower Ground, Basement |
| Letter-suffixed | Flat 3B | 2nd floor |
| Explicit in address | "3rd Floor" | 3rd floor |

### Lift Inference

Lift status is determined by priority:
1. Community driver reports (3+ reports = CONFIRMED)
2. OSM `elevator=yes` tag on building way
3. UK Building Regulation height rules:
   - 10+ floors → LIKELY_YES (HIGH confidence)
   - 5+ floors → LIKELY_YES (MEDIUM confidence, mandatory per UK regs)
   - 4 floors → LIKELY_YES (LOW confidence)
   - ≤3 floors → LIKELY_NO

### Floor Penalty (extra service time)

| Scenario | Extra time per floor |
|---|---|
| Lift available | +24 sec/floor + 45 sec wait |
| Stairs only | +48 sec/floor |
| Oversize parcel multiplier | ×1.6 |
| Heavy parcel (>15kg) multiplier | ×1.4 |
| Multiple parcels | +50% per additional parcel |

### Difficulty Score (1–5)

A combined score fed to the dispatcher console and workload balancer:

| Score | Meaning |
|---|---|
| 1–2 | Easy — ground or low floor, light parcel |
| 2–3 | Moderate — mid floor with lift |
| 3–4 | Hard — high floor or heavy parcel |
| 4–5 | Very hard — no lift + heavy + high floor |

### Driver Notification Examples

```
🏢 3rd floor — 🛗 Lift available. ⏱️ +1.6 min service time.
```
```
🏢 5th floor — 🚶 Stairs only. 🔔 Intercom/buzzer at entrance. ⏱️ +4.8 min service time. ⚠️ Difficult stop — allow extra time.
```
```
🏢 Ground floor — ❓ Lift unknown.
```

---

## Integration with Route Optimizer

When `analyseApartment()` runs, `floorPenaltyMinutes` and `difficultyScore` are injected into the stop record before the optimizer sequences the route.

This means:
- Difficult apartment stops are not back-to-back unless the zone forces it
- ETA bands account for stair climbs and lift waits
- Dispatchers see a workload-balanced route, not just a distance-optimal one
