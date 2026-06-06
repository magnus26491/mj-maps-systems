# Walk vs Drive Cluster Decision Engine

The most differentiated feature in MJ Maps. No other delivery routing app implements this decision logic.

## What It Does

When the route contains 2+ stops within 300m of each other, the engine:

1. Calculates exact **walk time** (outbound + all doors + return to van)
2. Calculates exact **drive time** (approach + all doors + turn-around overhead + next-road penalty)
3. Checks for **pedestrian cut-throughs** (OSM footways, alleys, snickets) that shorten the walk path
4. Cross-references **turn feasibility** on the current road AND the next road after the cluster
5. Separates **heavy/oversize parcels** that must always be driven
6. Recommends WALK / DRIVE / WALK_VIA_CUTTHROUGH / MIXED with a single clear notification

## Driver Notification Examples

### Dead-end cul-de-sac, 4 stops, van cannot turn:
```
🚶 4 deliveries ahead on this road.
Park here — walking saves ~8 min (6 min walk vs 14 min driving).
⚠️ Dead end — your vehicle cannot turn at the end.
```

### Cut-through available, 3 stops on main + 2 on alley side:
```
🚶 5 deliveries ahead. There's a cut-through to the next road.
Park here, walk all stops + use the alley — saves ~11 min
(9 min total vs 20 min driving round).
```

### Mixed cluster (1 heavy parcel, 3 normal):
```
🚗🚶 4 deliveries on this road.
Drive to 1 heavy stop, then park and walk 3 — saves ~5 min.
```

## Decision Logic

```
walkTime  = (walkDist / walkSpeed) + (stops × serviceTime) + (walkDist / returnSpeed)
driveTime = (driveDist / driveSpeed) + (stops × serviceTime) + turnPenalty + nextRoadPenalty

if cutThrough: walkDist × 0.70
if walkTime < driveTime × 0.85: recommend WALK
if heavy stops exist: split MIXED
else: DRIVE
```

## Cross-Reference: Next Road Turn Feasibility

This is the key insight. The engine doesn't just look at the current road —
it also checks the turn feasibility of the **next road the driver would continue to** after the cluster.

If both the current road AND the next road are RED for the vehicle size, walking
both clusters from a single central parking point wins decisively.

## OSM Pedestrian Path Integration

Cut-throughs are sourced from OSM:
- `highway=footway` — standard footway
- `highway=path` — unmarked path
- `highway=alley` — back alley
- `highway=pedestrian` — pedestrianised area
- `access=yes` — confirmed public access

Community verification layer: drivers can confirm or deny cut-through usability in-app.
Verified cut-throughs are shared across the driver network.

## Parcel Weight/Size Gates

| Condition | Forced action |
|---|---|---|
| Any parcel > 15kg | Drive to that stop |
| Oversize parcel (>60cm dimension) | Drive to that stop |
| >3 parcels at one stop | Drive to that stop |
| Driver has mobility limitation | Drive all stops |
| Walk distance > driver's max (default 400m) | Drive all stops |
| Steps in path + driver avoids steps | Drive all stops |
