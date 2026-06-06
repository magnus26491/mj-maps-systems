# Route Graph Solver

The Route Graph Solver is the core intelligence engine of MJ Maps Systems. It takes a list of delivery stops, a vehicle profile, handedness setting, and departure time, and produces an optimised, constraint-aware route sequence that a driver can execute without manual rerouting.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ROUTE GRAPH SOLVER                          │
├──────────────┬──────────────────┬───────────────────────────────┤
│  constraint  │    graph.ts      │         solver.ts             │
│  aggregator  │                  │                               │
│              │  RouteGraph      │  1. Prune hard blocks         │
│  Bridge      │  ─ GraphNode[]   │  2. Nearest-neighbour         │
│  Turn        │  ─ GraphEdge[]   │     construction              │
│  Closure     │  ─ CostMatrix    │  3. 2-opt improvement         │
│  Traffic     │                  │  4. Time-window validation    │
│  School      │  buildCost       │  5. Warning collection        │
│  Crossing    │  Matrix()        │  6. RouteSolution output      │
│  Kerb        │                  │                               │
└──────────────┴──────────────────┴───────────────────────────────┘
```

## Constraint Weight System

Every road segment (edge) gets a `costMultiplier` applied to its nominal travel time:

| Constraint | Cost Multiplier | Effect |
|---|---|---|
| Bridge AMBER | ×1.40 | Route prefers alternates where available |
| Bridge RED/EMERGENCY | ×999,999 | Hard block — never used |
| Turn-around AMBER | ×1.30 | Slight preference for alternative approach |
| Turn-around RED | ×6.00 | Strongly avoided — rerouted in most cases |
| Sharp turn SLOW | ×1.20 | Minor penalty |
| Sharp turn AVOID | ×5.00 | Strong penalty — alternate found if possible |
| Full road closure | ×999,999 | Hard block |
| Lane closure | ×1.50 | Expect delays — factored into ETA |
| Peak traffic (congestion 0.7+) | ×1.3–1.6 | Departure time shifted if possible |
| School zone MEDIUM | ×1.35 | Stop rescheduled to off-peak if possible |
| School zone HIGH (road closed) | ×999,999 | Hard block — stop rescheduled |
| Level crossing delay (>2 min) | ×1.10+ | Added to ETA, route preference adjusted |
| Kerb mismatch MAJOR | ×1.25 | Stop approach direction preference adjusted |

All penalties are **additive multiplicative** — a segment with both an AMBER bridge and peak traffic gets `1.40 × 1.35 = 1.89×` cost, so the solver will look hard for an alternative path.

## Solver Complexity

| Stops | Algorithm | Typical Solve Time |
|---|---|---|
| ≤50 | Nearest-neighbour + 2-opt | <10ms |
| 50–200 | Nearest-neighbour + 2-opt | 20–150ms |
| 200–500 | 2-opt + 3-opt | 150ms–2s |
| 500+ | OR-Tools VRP (microservice) | 2–15s |

For ≤200 stops the solver runs fully **client-side** (WASM build target) so it works offline. For larger routes it calls the OR-Tools microservice with the pre-computed cost matrix — the network request is small (just the matrix, not raw GPS data).

## 2-Opt Improvement

After nearest-neighbour construction, the 2-opt pass repeatedly reverses sub-sequences of the route if doing so reduces total cost. It continues until no improving swap is found. Key constraint: any swap that violates a hard time window is rejected immediately, so the solver always produces a time-window-feasible solution.

## Time Windows

Stops can have:
- **Hard windows** (`timeWindowOpen`, `timeWindowClose`) — solver guarantees feasibility or marks stop as delayed
- **Soft windows** — preference only; violation adds a penalty cost but does not block the swap

## Unreachable Stops

If a stop is completely surrounded by hard-blocked edges (all bridges too low, full closure on all approach roads), it is added to `unreachableStops` in the solution. The app surfaces this to the dispatcher before the shift starts so the stop can be rescheduled or reassigned.

## Fleet Extension

The single-vehicle solver in `solver.ts` extends to a full fleet VRP by:
1. Running Clarke-Wright savings across all driver pairs to cluster stops by driver
2. Solving each driver's cluster independently with this solver
3. Balancing workload (total duration) across drivers within ±15% tolerance

Scaffold: `services/fleet-solver/index.ts` — next milestone.
