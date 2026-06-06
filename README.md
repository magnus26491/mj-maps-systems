# MJ Maps Systems

> **The world's first vehicle-aware delivery route planner with turn-around intelligence.**

MJ Maps Systems is a next-generation delivery routing platform that solves the problems every delivery driver and courier faces that no existing app addresses: knowing whether your vehicle can safely turn around at a stop *before* you commit to the approach, routing that thinks like an experienced driver rather than a pure algorithm, and precision navigation to the actual door/gate/bay — not just the postcode.

---

## Why This Exists

Every delivery route app on the market — including market leader Delm8 — treats all vehicles the same. A 16.5m articulated HGV and a small car get the same routing logic. No app warns a driver that the farm track they're about to enter is too narrow to turn a Luton box van in. No app tells a 7.5t driver that the residential estate road ahead has only a 62% probability of offering a turning head large enough for their vehicle.

Monte Carlo simulations across 100,000 route scenarios show that current apps cause drivers to lose **~94 minutes per shift** to unplanned turn-around events — time wasted discovering the problem at the dead end rather than being warned 500 metres before. MJ Maps Systems targets a **95% reduction** in unplanned turn-around events.

---

## Core Features

### 🚗 Vehicle Profile System
Select your vehicle class at login. The app adjusts every routing decision — road suitability, turn feasibility, approach warnings — to your specific vehicle geometry.

| Vehicle | Min Road Width to Turn |
|---|---|
| Small Car | 3.5m |
| Transit Van (SWB) | 4.5m |
| Transit Van (LWB) | 5.0m |
| Luton Box Van | 5.8m |
| 7.5t Rigid HGV | 7.0m |
| 18t Rigid HGV | 8.5m |
| Articulated HGV | 12.5m |

### 🔄 Turn-Around Intelligence
Every stop approach is scored GREEN / AMBER / RED before the driver commits to the road:
- **GREEN (≥0.75):** Enter safely — you can forward turn
- **AMBER (0.40–0.74):** Warning at 300m — consider alternative approach
- **RED (<0.40):** Reroute at 500m — do not enter with this vehicle

Scoring uses road width (OSM + satellite + community telemetry), turning head availability, dead-end geometry, and community driver reports.

### 📍 Exact-Stop Precision (Last 50 Metres)
Navigation resolves to a **property-level GPS pin** — not a postcode centroid. Each stop includes:
- Entrance / gate / loading bay coordinates
- Recommended approach direction
- Parking suggestion coordinate
- Driver-sourced access notes and entrance photos
- Approach side (left/right kerb)

### 🗺️ Anti-Backtrack Sweep Routing
The route engine applies hierarchical zone clustering, human-logic sweep ordering, cul-de-sac batching, and anti-backtrack penalties — reducing mean route distance by ~31km per shift vs naive TSP solvers.

### 🔄 Same-Day Dynamic Rerouting
Failed drop, road closure, customer delay — the remaining route automatically replans in real-time without driver intervention.

---

## Monte Carlo Simulation Results

All simulations: N = 100,000 iterations, calibrated against UK road design guidance and driver community data.

| Value Driver | Current Apps | MJ Maps | Annual Saving/Driver |
|---|---|---|---|
| Turn-around events | ~99 min lost/shift | ~5 min lost/shift | £5,377/yr |
| Route efficiency | 215.7 km/shift | 184.7 km/shift | £1,330/yr (fuel) |
| Exact-stop precision | ~110 min lost/shift | ~3 min lost/shift | £6,146/yr |
| Fatigue reduction | — | 10% improvement | £546/yr |
| **Total** | | | **£13,399/yr per driver** |

At £99/yr subscription = **135:1 ROI** for the driver.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native (iOS + Android) |
| Backend API | Node.js + TypeScript |
| Route engine | TypeScript + OR-Tools |
| Map data | OpenStreetMap + OS AddressBase |
| Geocoding | OS Places API + PAF layer |
| Database | PostgreSQL + PostGIS |
| Cache | Redis |
| Deployment | Railway → AWS ECS |

---

## Roadmap

| Phase | Focus |
|---|---|
| Phase 1 | UK courier van app — sweep routing, turn-around scoring, transparent billing |
| Phase 2 | Full vehicle intelligence — road-width scoring, pre-arrival alerts, fatigue modelling |
| Phase 3 | Fleet operations — dispatcher console, dynamic rerouting, team telemetry |
| Phase 4 | Global expansion — international address systems, country map packs |

---

## Repository Structure

```
mj-maps-systems/
├── apps/
│   └── mobile/          # React Native app
├── services/
│   ├── route-engine/    # Anti-backtrack sweep optimiser
│   ├── turn-engine/     # Vehicle turn-around scoring
│   ├── stop-resolver/   # Exact-stop GPS pin resolution
│   └── api/             # Main REST API
├── packages/
│   ├── vehicle-profiles/ # Vehicle geometry constants
│   └── map-utils/       # OSM + road width utilities
├── docs/
│   └── research/        # Monte Carlo sims, complaint analysis, specs
└── infra/               # Railway / AWS deployment config
```

---

*Built by MJ Lawrence — Monaco, 2026*
