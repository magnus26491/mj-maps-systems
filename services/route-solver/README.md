# route-solver — OR-Tools VRP Sidecar

A minimal Python HTTP server that solves the Vehicle Routing Problem with
Time Windows (VRPTW) using Google OR-Tools. The Node.js API calls this when
`ROUTE_SOLVER_URL` is configured; otherwise it falls back to the TypeScript
nearest-neighbour solver in `services/routing/or-tools-client.ts`.

## API

### `POST /solve`

```json
{
  "durations": [[0, 300, 600], [300, 0, 200], [600, 200, 0]],
  "distances": [[0, 5000, 8000], [5000, 0, 3000], [8000, 3000, 0]],
  "service_times": [0, 300, 300],
  "time_windows": [[0, 86400], [0, 86400], [0, 86400]],
  "depot_index": 0,
  "time_limit_s": 30
}
```

Response:
```json
{
  "ordered_indices": [1, 2],
  "total_duration_sec": 1700.0,
  "total_distance_m": 16000.0,
  "status": "optimal",
  "solver_ms": 142
}
```

`status` values:
- `optimal` — OR-Tools found the optimal solution
- `feasible` — Solution found but time limit hit before proving optimality
- `timeout` — Same as feasible
- `infeasible` — No valid solution exists (check time windows)
- `greedy` — OR-Tools not installed, used nearest-neighbour fallback

### `GET /health`

```json
{"ok": true, "ortools": true}
```

## Running locally

```bash
pip install ortools
python solver.py
# or
docker build -t route-solver .
docker run -p 8080:8080 route-solver
```

Set `ROUTE_SOLVER_URL=http://localhost:8080` in the API's `.env` to enable.
