/**
 * Contract tests for the OSRM matrix client.
 * Uses mocked HTTP — no real OSRM required.
 */

import * as http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { OsrmMatrixClient } from '../../services/routing/osrm-client';

// A minimal OSRM /table mock server
function startMockOsrm(response: object, statusCode = 200): Promise<{ port: number; close: () => void }> {
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

describe('OsrmMatrixClient', () => {
  const coords = [
    { lat: 51.5, lng: -0.1 },
    { lat: 51.51, lng: -0.11 },
    { lat: 51.52, lng: -0.12 },
  ];

  test('returns OSRM matrix when OSRM_URL is set and server responds', async () => {
    const mockResponse = {
      code: 'Ok',
      durations: [[0, 300, 600], [300, 0, 200], [600, 200, 0]],
      distances: [[0, 5000, 8000], [5000, 0, 3000], [8000, 3000, 0]],
    };

    const mock = await startMockOsrm(mockResponse);
    process.env.OSRM_URL = `http://127.0.0.1:${mock.port}`;

    try {
      const client = new OsrmMatrixClient();
      const result = await client.getMatrix(coords);

      expect(result.source).toBe('osrm');
      expect(result.durations).toEqual(mockResponse.durations);
      expect(result.distances).toEqual(mockResponse.distances);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      mock.close();
      delete process.env.OSRM_URL;
    }
  });

  test('falls back to Haversine when OSRM_URL is unset', async () => {
    delete process.env.OSRM_URL;
    const client = new OsrmMatrixClient();
    const result = await client.getMatrix(coords);

    expect(result.source).toBe('haversine');
    expect(result.durations.length).toBe(coords.length);
    expect(result.distances.length).toBe(coords.length);
    // Diagonal must be zero
    for (let i = 0; i < coords.length; i++) {
      expect(result.durations[i][i]).toBe(0);
      expect(result.distances[i][i]).toBe(0);
    }
    // Off-diagonal must be positive
    expect(result.distances[0][1]).toBeGreaterThan(0);
    expect(result.durations[0][1]).toBeGreaterThan(0);
  });

  test('falls back to Haversine when OSRM server errors', async () => {
    const mock = await startMockOsrm({ code: 'InvalidUrl' }, 400);
    process.env.OSRM_URL = `http://127.0.0.1:${mock.port}`;

    try {
      const client = new OsrmMatrixClient();
      const result = await client.getMatrix(coords);
      expect(result.source).toBe('haversine');
    } finally {
      mock.close();
      delete process.env.OSRM_URL;
    }
  });

  test('Haversine matrix is symmetric', async () => {
    delete process.env.OSRM_URL;
    const client = new OsrmMatrixClient();
    const result = await client.getMatrix(coords);

    for (let i = 0; i < coords.length; i++) {
      for (let j = 0; j < coords.length; j++) {
        // Symmetric within 1m (integer rounding)
        expect(Math.abs(result.distances[i][j] - result.distances[j][i])).toBeLessThanOrEqual(1);
      }
    }
  });
});
