# Turn Engine

Evaluates whether a vehicle can safely execute a forward turn at a delivery stop, and fires tiered alerts to the driver before they enter an unsuitable road.

## How It Works

### 1. Road Data Fetch
Queries OpenStreetMap Overpass API for all road ways within 80–150m of the stop coordinate. Extracts:
- Kerb-to-kerb width (OSM `width` tag, or `est_width`, or highway-class default)
- Dead-end / noexit flags
- Turning head / turning circle presence
- Lay-by presence
- One-way restrictions
- Max weight / height / width restrictions

### 2. Turn Score Computation

```
TURN_SCORE = (roadWidthM / minWidthNeeded)
           + 0.30  if turning head present
           + 0.15  if lay-by present  
           - 0.50  if dead end with no turning head
           - 0.20  if private access road
```

Blended 60/40 with community driver report score if available. Clamped to [0, 1].

### 3. Alert Levels

| Score | Level | Trigger Distance | Action |
|-------|-------|-----------------|--------|
| ≥ 0.75 | 🟢 GREEN | 0m (no alert) | Proceed normally |
| 0.40–0.74 | 🟡 AMBER | 300m before stop | Warn driver, suggest caution |
| < 0.40 | 🔴 RED | 500m before stop | Reroute, do not enter |

### 4. Vehicle Minimum Turn Widths

| Vehicle | Min Turn Width |
|---------|---------------|
| SWB Van | ~7.6m |
| LWB Van | ~8.3m |
| Luton Box | ~9.5m |
| 7.5t Rigid | ~12.0m |
| 18t Rigid | ~15.1m |
| Artic 13.6m | ~18.0m |

## API

```typescript
import { evaluateTurnFeasibility } from './services/turn-engine';

const alert = await evaluateTurnFeasibility(
  51.5074,   // lat
  -0.1278,   // lon
  'lwb_van', // vehicle ID
);
// → { level: 'GREEN', score: 0.83, canForwardTurn: true, instruction: '...' }
```
