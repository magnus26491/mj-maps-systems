# Road Closure & Live Rerouting Engine

The Road Closure Engine integrates real-time and planned roadwork data from official UK sources to pre-route around closures before the shift starts, and dynamically reroute during the shift when live incidents occur.

## Data Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   CLOSURE DATA PIPELINE                  │
├─────────────────┬───────────────────┬────────────────────┤
│  one.network    │  NTIS (Nat'l      │  Driver community  │
│  / Elgin API    │  Traffic Info)    │  reports (in-app)  │
│  ±5 min latency │  Strategic roads  │  Real-time         │
│  300+ LHAs      │  Real-time        │                    │
└────────┬────────┴────────┬──────────┴────────┬───────────┘
         │                 │                   │
         └─────────────────▼───────────────────┘
                    Closure Normaliser
                  (unified RoadClosure[])
                           │
              ┌────────────▼────────────┐
              │   Route Graph Engine    │
              │  (avoid closure edges)  │
              └────────────┬────────────┘
                           │
         ┌─────────────────▼──────────────────┐
         │  Vehicle Filter (height / weight)   │
         │  evaluateClosure(closure, vehicle)  │
         └─────────────────┬──────────────────┘
                           │
                  ┌────────▼────────┐
                  │  Driver Alert   │
                  │  WARN / REROUTE │
                  └─────────────────┘
```

## Pre-Shift Route Planning

When a driver loads their stop list:

1. Fetch all active and planned closures within the route bounding box (one.network API)
2. Filter closures by vehicle profile (height restrictions, weight restrictions, vehicle class)
3. Build route graph with closure edges removed or penalised
4. Optimise stop order around the clean graph
5. Flag any stops that become temporarily inaccessible with ETA impact estimate

## Live Rerouting (During Shift)

Polling interval: every **90 seconds** on strategic roads, every **5 minutes** on local roads.

When a new closure appears on the remaining route:

1. Detect which upcoming stops are affected
2. Calculate optimal detour maintaining stop order integrity
3. Push update to driver with: extra distance, extra time, revised ETA
4. Driver sees a non-intrusive notification — tap to accept or dismiss
5. Accepted reroutes are logged for community learning

## Vehicle-Specific Closure Types

Not all closures affect all vehicles. The engine filters by:

| Restriction Type | Applies To |
|---|---|
| Height restriction (e.g. 3.5m tunnel) | Any vehicle taller than restriction |
| Weight restriction (e.g. 7.5t limit) | HGVs above weight threshold |
| Width restriction | Wide loads, certain HGVs |
| HGV ban (e.g. residential area) | All vehicles with `maxWeightT > 3.5` |
| Emergency closure (full) | All vehicles |
| Lane closure | All vehicles (warn only, no reroute) |
| Contraflow | All vehicles (warn + speed advisory) |

## API Integration

### one.network (Causeway)
- Coverage: Great Britain — 300+ public authorities + utility companies
- Data: live incidents, planned roadworks (up to 3 months forward), traffic management
- Endpoint: REST API — `GET /disruptions?bbox={minLat},{minLng},{maxLat},{maxLng}`
- Latency: ±5 minutes for live incidents; planned works updated daily

### Elgin Data API
- Coverage: England + Wales (95%+ of Local Highway Authorities)
- Data: streetworks, road closures, events, traffic management interventions
- Endpoint: REST/SOAP
- Contact: support@elgin.org.uk

### NTIS (National Traffic Information Service)
- Coverage: Strategic road network (motorways + A-roads)
- Data: real-time incidents, variable message signs, journey times
- Format: DATEX II XML
- Access: Via National Highways data portal
