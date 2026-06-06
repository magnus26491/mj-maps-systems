# Route Engine

Optimises multi-stop delivery routes using a sweep-zone + nearest-neighbour + 2-opt pipeline that eliminates backtracking and respects vehicle constraints.

## Algorithm Pipeline

```
1. SECTOR ALLOCATION
   Divide stops into N angular sectors (default 8) centred on depot.
   Sectors processed clockwise → eliminates cross-town backtracking.

2. NEAREST-NEIGHBOUR SOLVE (per sector)
   Greedy from sector entry point. O(n²) — fast for ≤200 stops/sector.

3. 2-OPT REFINEMENT (per sector)
   Iterative edge-swap improvement. Typically 5–15% distance reduction.

4. SIDE-OF-ROAD ASSIGNMENT
   Each stop assigned approach side (left/right) based on travel bearing.
   UK rule: favour left-side stops to avoid U-turns and cross-traffic.

5. TIME-WINDOW CHECK
   Hard windows generate route warnings.
   Soft windows influence 2-opt swap scoring (penalise late arrivals).

6. TURN ALERT OVERLAY
   RED-level stops flagged as cul-de-sac batch candidates.
```

## Anti-Backtrack Guarantee

The sector sweep means the driver completes an entire geographic zone before moving to the next. Stops in the same street are always consecutively sequenced. The 2-opt pass removes any remaining crossed edges within a sector.

## Mid-Route Replanning

Call `replanFromPosition()` with the current GPS position and remaining stops.
Re-runs the full pipeline from current location as the new origin in <50ms for ≤200 stops.

## API

```typescript
import { planRoute } from './services/route-engine';

const result = planRoute({
  stops: stopInputs,
  depotLat: 51.5,
  depotLon: -0.1,
  shiftStart: '2026-06-06T08:00:00Z',
  avgSpeedKmh: 30,
});
```
