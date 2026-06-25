/**
 * Contract tests for the OR-Tools sidecar client.
 * Uses mocked HTTP — no Python sidecar required.
 */

import * as http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { OrToolsClient } from '../../services/routing/or-tools-client';
import type { VrpInput, MatrixResult } from '../../services/routing/types';

function startMockSolver(
  response: object,
  statusCode = 200,
): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ port: addr.port, close: () => server.close() });
    });
  });
}

const threeStopMatrix: MatrixResult = {
  durations: [[0, 300, 600, 400], [300, 0, 200, 500], [600, 200, 0, 100], [400, 500, 100, 0]],
  distances: [[0, 5000, 8000, 6000], [5000, 0, 3000, 7000], [8000, 3000, 0, 2000], [6000, 7000, 2000, 0]],
  durationMs: 10,
  source: 'osrm',
};

const threeStopInput: VrpInput = {
  stops: [
    { id: 'A', lat: 51.5, lng: -0.1, serviceSeconds: 300 },
    { id: 'B', lat: 51.51, lng: -0.11, serviceSeconds: 300 },
    { id: 'C', lat: 51.52, lng: -0.12, serviceSeconds: 300 },
  ],
  depot: { lat: 51.49, lng: -0.09 },
  vehicleConstraints: { vehicleId: 'transit-van-swb' },
  shiftStartEpoch: Math.floor(Date.now() / 1000),
};

describe('OrToolsClient', () => {
  test('returns OR-Tools result when sidecar responds', async () => {
    const mockResponse = {
      ordered_indices: [1, 2, 3],
      total_duration_sec: 1800,
      total_distance_m: 20000,
      status: 'optimal',
    };

    const mock = await startMockSolver(mockResponse);
    process.env.ROUTE_SOLVER_URL = `http://127.0.0.1:${mock.port}`;

    try {
      const client = new OrToolsClient();
      const result = await client.solve(threeStopInput, threeStopMatrix);

      expect(result.source).toBe('ortools');
      expect(result.orderedIds).toEqual(['A', 'B', 'C']);
      expect(result.totalDurationSec).toBe(1800);
      expect(result.totalDistanceM).toBe(20000);
    } finally {
      mock.close();
      delete process.env.ROUTE_SOLVER_URL;
    }
  });

  test('falls back to nearest-neighbour when ROUTE_SOLVER_URL is unset', async () => {
    delete process.env.ROUTE_SOLVER_URL;
    const client = new OrToolsClient();
    const result = await client.solve(threeStopInput, threeStopMatrix);

    expect(result.source).toBe('ts-sequencer');
    expect(result.orderedIds).toHaveLength(3);
    expect(result.orderedIds).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    expect(result.totalDurationSec).toBeGreaterThan(0);
  });

  test('falls back to nearest-neighbour when sidecar times out / errors', async () => {
    // Return an empty ordered_indices to simulate failure
    const mock = await startMockSolver({ ordered_indices: [], status: 'infeasible' });
    process.env.ROUTE_SOLVER_URL = `http://127.0.0.1:${mock.port}`;

    try {
      const client = new OrToolsClient();
      const result = await client.solve(threeStopInput, threeStopMatrix);
      // Should fall back
      expect(result.source).toBe('ts-sequencer');
    } finally {
      mock.close();
      delete process.env.ROUTE_SOLVER_URL;
    }
  });

  test('nearest-neighbour visits every stop exactly once', async () => {
    delete process.env.ROUTE_SOLVER_URL;
    const client = new OrToolsClient();
    const result = await client.solve(threeStopInput, threeStopMatrix);

    const unique = new Set(result.orderedIds);
    expect(unique.size).toBe(threeStopInput.stops.length);
  });
});
