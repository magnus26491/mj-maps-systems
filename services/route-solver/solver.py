"""
MJ Maps — OR-Tools VRP Solver Sidecar

Exposes POST /solve with an N×N time/distance matrix and returns an ordered
stop sequence. Uses Google OR-Tools VRPTW with a hard time limit.

Health: GET /health → {"ok": true}
"""

import os
import sys
import time
import json
import math
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any

try:
    from ortools.constraint_solver import routing_enums_pb2
    from ortools.constraint_solver import pywrapcp
    ORTOOLS_AVAILABLE = True
except ImportError:
    ORTOOLS_AVAILABLE = False
    print("[solver] WARNING: ortools not installed — /solve will return greedy fallback", file=sys.stderr)

PORT = int(os.environ.get("PORT", "8080"))


def solve_vrp(data: dict) -> dict:
    """
    Solve the VRP using OR-Tools VRPTW.

    Input:
      durations: N×N float matrix (seconds) — includes depot at index 0
      distances: N×N float matrix (metres)
      service_times: list[float] — per-node service time (seconds); index 0 = depot
      time_windows: list[[float, float]] — [open, close] seconds from shift start
      depot_index: int (always 0)
      time_limit_s: float

    Output:
      ordered_indices: list[int] — stop indices (1-based, excl. depot)
      total_duration_sec: float
      total_distance_m: float
      status: "optimal" | "feasible" | "infeasible" | "timeout" | "greedy"
    """
    durations = data["durations"]
    distances = data["distances"]
    service_times = data.get("service_times", [0] * len(durations))
    time_windows = data.get("time_windows", [[0, 86400]] * len(durations))
    depot = data.get("depot_index", 0)
    time_limit_s = float(data.get("time_limit_s", 30))
    n = len(durations)

    if n <= 1:
        return {"ordered_indices": [], "total_duration_sec": 0, "total_distance_m": 0, "status": "optimal"}

    if not ORTOOLS_AVAILABLE:
        return _greedy_fallback(durations, distances, service_times, depot)

    # Scale to integers (OR-Tools works with integers)
    scale = 10  # 0.1s precision
    int_durations = [[int(d * scale) for d in row] for row in durations]
    int_services  = [int(s * scale) for s in service_times]
    int_windows   = [[int(w[0] * scale), int(w[1] * scale)] for w in time_windows]

    manager = pywrapcp.RoutingIndexManager(n, 1, depot)
    routing = pywrapcp.RoutingModel(manager)

    def time_callback(from_idx, to_idx):
        from_node = manager.IndexToNode(from_idx)
        to_node   = manager.IndexToNode(to_idx)
        return int_durations[from_node][to_node] + int_services[from_node]

    def dist_callback(from_idx, to_idx):
        from_node = manager.IndexToNode(from_idx)
        to_node   = manager.IndexToNode(to_idx)
        return int(distances[from_node][to_node])

    transit_cb_idx = routing.RegisterTransitCallback(time_callback)
    dist_cb_idx    = routing.RegisterTransitCallback(dist_callback)

    routing.SetArcCostEvaluatorOfAllVehicles(transit_cb_idx)

    # Time dimension with time-window constraints
    max_horizon = int(86400 * scale)
    routing.AddDimension(
        transit_cb_idx,
        max_horizon,   # slack
        max_horizon,   # max time per vehicle
        False,         # don't force start cumul to zero
        "Time",
    )
    time_dim = routing.GetDimensionOrDie("Time")
    for node in range(n):
        idx = manager.NodeToIndex(node)
        open_t, close_t = int_windows[node]
        time_dim.CumulVar(idx).SetRange(open_t, close_t)

    # Distance dimension (for secondary objective)
    routing.AddDimension(dist_cb_idx, 0, 10_000_000, True, "Distance")
    dist_dim = routing.GetDimensionOrDie("Distance")
    dist_dim.SetGlobalSpanCostCoefficient(100)

    search_params = pywrapcp.DefaultRoutingSearchParameters()
    search_params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search_params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search_params.time_limit.FromSeconds(int(math.ceil(time_limit_s)))
    search_params.log_search = False

    solution = routing.SolveWithParameters(search_params)

    if solution is None:
        return _greedy_fallback(durations, distances, service_times, depot)

    status_map = {
        routing.ROUTING_NOT_SOLVED:  "infeasible",
        routing.ROUTING_SUCCESS:     "optimal",
        routing.ROUTING_PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED: "feasible",
        routing.ROUTING_FAIL:        "infeasible",
        routing.ROUTING_FAIL_TIMEOUT: "timeout",
        routing.ROUTING_INVALID:     "infeasible",
    }
    status = status_map.get(routing.status(), "feasible")

    # Extract route
    ordered: list[int] = []
    idx = routing.Start(0)
    while not routing.IsEnd(idx):
        node = manager.IndexToNode(idx)
        if node != depot:
            ordered.append(node)
        idx = solution.Value(routing.NextVar(idx))

    total_dur = _compute_total(durations, service_times, ordered, depot)
    total_dist = _compute_total(distances, [0] * n, ordered, depot)

    return {
        "ordered_indices": ordered,
        "total_duration_sec": total_dur,
        "total_distance_m": total_dist,
        "status": status,
    }


def _greedy_fallback(durations, distances, service_times, depot):
    """Nearest-neighbour greedy when OR-Tools is unavailable."""
    n = len(durations)
    remaining = [i for i in range(n) if i != depot]
    ordered = []
    current = depot
    while remaining:
        best = min(remaining, key=lambda j: durations[current][j])
        ordered.append(best)
        remaining.remove(best)
        current = best
    total_dur = _compute_total(durations, service_times, ordered, depot)
    total_dist = _compute_total(distances, [0] * n, ordered, depot)
    return {
        "ordered_indices": ordered,
        "total_duration_sec": total_dur,
        "total_distance_m": total_dist,
        "status": "greedy",
    }


def _compute_total(matrix, service, ordered, depot):
    total = 0.0
    prev = depot
    for idx in ordered:
        total += matrix[prev][idx] + service[idx]
        prev = idx
    total += matrix[prev][depot]
    return total


class SolverHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[solver] {fmt % args}", file=sys.stderr)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "ortools": ORTOOLS_AVAILABLE})
        else:
            self._json(404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        if self.path != "/solve":
            self._json(404, {"ok": False, "error": "Not found"})
            return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except json.JSONDecodeError as e:
            self._json(400, {"ok": False, "error": f"Invalid JSON: {e}"})
            return
        try:
            t0 = time.time()
            result = solve_vrp(data)
            result["solver_ms"] = round((time.time() - t0) * 1000)
            self._json(200, result)
        except Exception as e:
            print(f"[solver] ERROR: {e}", file=sys.stderr)
            self._json(500, {"ok": False, "error": str(e)})

    def _json(self, code: int, payload: Any):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print(f"[solver] Starting OR-Tools sidecar on port {PORT} (ortools={ORTOOLS_AVAILABLE})")
    server = HTTPServer(("0.0.0.0", PORT), SolverHandler)
    server.serve_forever()
