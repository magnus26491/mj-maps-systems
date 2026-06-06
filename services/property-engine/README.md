# Route Optimizer + Property Setback Engine

## Route Optimizer

The route optimizer now provides a production-safe sequencing layer before the OSM enrichment pass.

### Current capabilities
- Nearest-neighbour seed route
- 2-opt improvement pass
- Soft time-window bias
- Anti-backtrack zone bias
- Priority weighting
- Setback-aware stop penalty
- Service-time uplift for deep-setback properties

### Why setback matters
A stop 60m back from the road is not operationally equivalent to a door directly on the kerb.
That affects:
- ETA accuracy
- Walk vs drive clustering
- Driver workload modelling
- Whether a driveway approach should be attempted
- Whether a stop should be handled before or after another stop nearby

## Property Setback Engine

The setback engine estimates how far the property is from the nearest accessible road edge.

### Output fields
| Field | Meaning |
|---|---|
| `setbackFromRoadM` | Estimated metres from road edge to delivery point |
| `likelyHasDriveway` | True when the property is far enough from road to imply private approach |
| `likelyGateOrLongAccess` | True when long access lane/gate is likely |
| `suggestedDropMode` | `CURBSIDE`, `SHORT_WALK`, `LONG_WALK`, or `DRIVEWAY_APPROACH` |
| `confidence` | Current confidence score |

### Current method
Version 1 uses nearest road geometry from OSM and calculates direct offset from the property point to the nearest road node.

### Planned upgrade
Version 2 should add:
- Building polygons (`way[building]`)
- Entrances / gates / intercom nodes
- Driveway/service-road path tracing
- Aerial/satellite inference for detached rural plots
- Exact road-edge projection on line segment instead of nearest node only

## Integration order
1. Estimate setback for all stops
2. Feed `setbackFromRoadM` into route optimizer
3. Sequence route
4. Run OSM road enricher
5. Run cluster and turn engines

## Practical examples
- Terraced house on road edge → `setbackFromRoadM = 3m`, `CURBSIDE`
- Detached suburban house with front garden → `18m`, `SHORT_WALK`
- Rural farmhouse down private lane → `85m`, `DRIVEWAY_APPROACH`
- Gated industrial unit setback from service road → `42m`, `LONG_WALK`
