# MJ Maps Systems — Full Monte Carlo Simulation Results

## Simulation Parameters

- N = 100,000 iterations
- Shift model: 130 stops/shift average, 175km mean route distance, 230 working days/year
- Driver rate: £15/hr (conservative UK van driver)
- Fuel cost: £0.12/km all-in (diesel at £1.55/L, 12.9L/100km van average)

---

## Monte Carlo Results — All Engines

| Engine | Mean Saving/Shift | Annual Hours | Annual £ Value |
|---|---|---|---|
| Turn-around intelligence | 23.4 min | 90 hrs | £5,377 |
| Anti-backtrack routing | 31km less | 51 hrs | £1,330 |
| Exact-stop precision | 107 min | 410 hrs | £6,146 |
| Bridge strike prevention (HGV) | Prevented | — | £1,200 |
| Road closure pre-routing + live | 43.8 min | 168 hrs | £2,859 |
| Departure-time traffic optimisation | variable | 2 hrs | £30 |
| School zone congestion avoidance | 3.1 min | 12 hrs | £27 |
| Sharp turn pre-warning (HGV) | 2.8 min | 11 hrs | £644 |
| LHD/RHD side-of-road stop ordering | 16.3 min | 62 hrs | £937 |
| Railway crossing avoidance | 1.5 min | 6 hrs | £83 |
| Fatigue reduction (10% productivity) | — | — | £546 |
| **TOTAL** | | **812 hrs/yr** | **£19,179/yr** |

---

## ROI Analysis

| Subscription Tier | Annual Cost | Driver ROI |
|---|---|---|
| Individual (courier) | £120/yr | 159:1 |
| Fleet (up to 10 vehicles) | £249/yr | 77:1 |
| Enterprise (per seat) | £99/yr | 193:1 |

**Fleet operator bridge strike value:** Each prevented strike saves £13,000. A fleet of 10 HGVs paying £2,490/yr subscription = 5.2 strikes prevented pays for 27 years of the subscription.

---

## Traffic Time-of-Day Model

Gaussian mixture model trained on TomTom Traffic Index UK 2023 data:

```
Congestion(t) = 0.10 (baseline)
              + 0.55 × exp(-0.5 × ((t - 8.25) / 0.60)²)   AM peak
              + 0.65 × exp(-0.5 × ((t - 17.50) / 0.70)²)  PM peak  
              + 0.30 × exp(-0.5 × ((t - 8.75) / 0.35)²)   School AM
              + 0.30 × exp(-0.5 × ((t - 15.35) / 0.35)²)  School PM
```

**Optimal departure windows:** 05:00–07:30, 09:30–15:00, 19:00+

**Worst windows to avoid:** 07:45–09:15 (AM peak + school), 15:00–16:00 (school PM), 16:30–18:30 (PM peak)

---

## LHD vs RHD Route Optimisation

### Right-Hand Drive (UK, Ireland, Australia, Japan, India, RSA)

- Driver sits on RIGHT side of vehicle
- Kerb is on LEFT when driving forward
- Preferred stop side: **LEFT** (no cross-traffic, direct kerb access)
- Preferred turn direction at junctions: **LEFT** (no oncoming traffic crossing)
- Sweep direction: **CLOCKWISE** from depot (maintains left-kerb access)
- U-turn preference: **left-side lay-by** before reversing

### Left-Hand Drive (EU, USA, Canada, China, most of world)

- Driver sits on LEFT side of vehicle
- Kerb is on RIGHT when driving forward  
- Preferred stop side: **RIGHT** (no cross-traffic)
- Preferred turn direction at junctions: **RIGHT**
- Sweep direction: **ANTICLOCKWISE** from depot
- U-turn preference: **right-side lay-by**

### Impact

With 130 stops/shift and LHD/RHD-aware ordering eliminating ~18 cross-traffic manoeuvres:
- **16.3 min saved per shift** (avg 0.9 min per eliminated crossing)
- Reduced accident exposure on cross-traffic moves
- Reduced stress / driver fatigue (easier kerb-side stops)
- Particularly significant for LWB, Luton, HGV where mirror/kerb clearance matters

---

## Sharp Turn Hazard Model

| Vehicle Class | Mean problem turns/shift | Delay if unwanted | Passable? |
|---|---|---|---|
| SWB/LWB Van | 1.2 | 1.5 min | Usually yes |
| Luton | 2.8 | 4.0 min | Often needs 3-pt turn |
| 7.5t HGV | 4.3 | 6.5 min | Sometimes impassable |
| 18t HGV | 6.1 | 9.0 min | Frequently impassable |
| Artic | 8.8 | 14.0 min | Regularly requires reroute |

Sharp turns are scored by: deviation angle + road width + surface + vehicle turning geometry (trailer swing for artics).

---

## Vehicle Height Entry Protocol

All `requiresHeightEntry: true` vehicle classes (van_high_roof, luton, hgv_75t, hgv_18t, artic, artic_highcube, double_deck) must complete height entry before routing is enabled:

1. **Driver enters exact vehicle height in metres** (displayed in both m and ft/in for convenience)
2. **Optional: payload height addition** (e.g. +0.3m for tall pallets)
3. **System validates** against profile min/max bounds (±200mm tolerance)
4. **Out-of-range warning** if entry seems implausible — re-measure prompt
5. **Height stored per vehicle** — retained for session, overrideable
6. **Fleet admin can pre-load** exact heights for all registered vehicles
7. **Telematics integration**: OBD/fleet management systems can push confirmed heights automatically

**Safety margin applied to all bridge/height restriction checks:** +300mm default (driver-configurable 100–500mm)
