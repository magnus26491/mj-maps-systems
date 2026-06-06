# Bridge Intelligence Engine

The Bridge Intelligence Engine prevents HGV bridge strikes by scoring every bridge on a planned or active route against the driver's vehicle height profile, issuing pre-emptive alerts and automatic reroutes before the vehicle reaches a dangerous structure.

## Problem Scale (UK)

- **1,532–1,833 bridge strikes per year** on UK rail bridges alone (Network Rail 2021/22)
- **~5 strikes per day** average
- **£13,000 average cost** per strike in repair, delays, and investigation
- **£23 million+ annual cost** to the UK economy
- **43% of HGV drivers** admit to not knowing the height of their own vehicle
- **52% of drivers** admit to not accounting for low bridges when planning routes
- Most struck bridge height: **~14ft (4.27m)** — within the operating range of articulated HGVs

## Data Sources

| Source | Coverage | Update Frequency | Data Type |
|---|---|---|---|
| Network Rail Bridge Height Dataset | All UK rail bridges | Annual (published Nov 2024) | Signed clearance heights |
| OpenStreetMap `maxheight` tag | Road network globally | Community-updated | Road/bridge height restrictions |
| OS OpenData | UK road network | Quarterly | Road geometry |
| one.network / Elgin API | Great Britain roadworks | Real-time (±5 min) | Live road closures, planned works |
| NTIS (National Traffic Information Service) | Strategic road network | Real-time | Incidents, lane closures |
| Driver community reports | App user network | Real-time | Verified/unverified corrections |

## Scoring Algorithm

See `packages/vehicle-profiles/index.ts` → `computeBridgeScore()`

```
BRIDGE_SCORE = f(raw_gap, confidence, is_signed, community_verified)

raw_gap = bridge_clearance_m - (vehicle_height_m + safety_margin_m)

if raw_gap < 0    → EMERGENCY REROUTE (definite strike)
if raw_gap < 0.1  → RED (too marginal)
0-500mm gap       → proportional 0.0 – 1.0 score
× confidence_multiplier (HIGH 1.0 / MEDIUM 0.85 / LOW 0.65)
× 0.75 if unsigned and below 5.03m signing threshold
```

## Alert Thresholds

| Score | Alert | Trigger Distance | Action |
|---|---|---|---|
| 1.0 | CLEAR | — | Silent pass-through |
| 0.80–0.99 | INFO | 300m | HUD shows bridge clearance vs vehicle height |
| 0.40–0.79 | AMBER | 500m | Audio warning + visual, driver can override |
| < 0.40 | RED | 800m | Auto-reroute, no override |
| raw_gap < 0 | EMERGENCY | 1000m | Audio + haptic alert, mandatory reroute |

## Safety Margin

Default margin: **+300mm** above vehicle height. Configurable for:
- Loads that increase height (e.g., pallets on flatbed)
- Seasonal bridge settlement (some bridges vary ±50mm seasonally)
- Driver preference (can increase to 500mm for extra caution)

## Vehicle Height Entry

All vehicle profiles with `requiresHeightEntry: true` prompt the driver to confirm exact vehicle height before the first route is calculated. This is **mandatory** — routing is blocked until confirmed for HGV classes. The entered height is:

1. Stored against the vehicle profile
2. Used for all bridge and height-restriction checks on the route
3. Flagged if it falls outside the profile's known `heightMinM`–`heightMaxM` range (possible entry error)
