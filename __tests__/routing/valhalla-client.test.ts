/**
 * Contract tests for the Valhalla maneuver client.
 * Uses mocked HTTP — no Valhalla instance required.
 */

import * as http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { ValhallaClient } from '../../services/routing/valhalla-client';
import type { VehicleConstraints } from '../../services/routing/types';

function startMockValhalla(
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

// Minimal Valhalla /route response with two legs
const mockValhallaResponse = {
  trip: {
    legs: [
      {
        maneuvers: [
          { type: 1, instruction: 'Set out heading north', length: 0.1, time: 30, begin_shape_index: 0, end_shape_index: 2, begin_heading: 0, end_heading: 10 },
          { type: 4, instruction: 'You have arrived at your destination', length: 0, time: 0, begin_shape_index: 2, end_shape_index: 2 },
        ],
        shape: 'yy_vHjzpFsBuB',
        length: 0.5,
        time: 90,
      },
    ],
    length: 0.5,
    time: 90,
  },
};

const constraints: VehicleConstraints = {
  vehicleId: 'transit-van-swb',
  heightM: 2.5,
  widthM: 2.0,
  lengthM: 5.5,
};

const coords = [
  { lat: 51.5, lng: -0.1 },
  { lat: 51.51, lng: -0.11 },
];

describe('ValhallaClient', () => {
  test('returns maneuver steps when VALHALLA_URL is set and server responds', async () => {
    const mock = await startMockValhalla(mockValhallaResponse);
    process.env.VALHALLA_URL = `http://127.0.0.1:${mock.port}`;

    try {
      const client = new ValhallaClient();
      const result = await client.getManeuvers(coords, constraints);

      expect(result.source).toBe('valhalla');
      expect(result.legs).toHaveLength(1);
      expect(result.legs[0].steps.length).toBeGreaterThan(0);
      expect(result.legs[0].steps[0].instruction).toBe('Set out heading north');
      expect(result.totalDurationSec).toBe(90);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      mock.close();
      delete process.env.VALHALLA_URL;
    }
  });

  test('returns source:none when VALHALLA_URL is unset', async () => {
    delete process.env.VALHALLA_URL;
    const client = new ValhallaClient();
    const result = await client.getManeuvers(coords, constraints);

    expect(result.source).toBe('none');
    expect(result.legs).toHaveLength(0);
  });

  test('returns source:none when Valhalla server errors', async () => {
    const mock = await startMockValhalla({ error: 'No route found' }, 400);
    process.env.VALHALLA_URL = `http://127.0.0.1:${mock.port}`;

    try {
      const client = new ValhallaClient();
      const result = await client.getManeuvers(coords, constraints);
      expect(result.source).toBe('none');
    } finally {
      mock.close();
      delete process.env.VALHALLA_URL;
    }
  });

  test('returns source:none for single coordinate (no route possible)', async () => {
    delete process.env.VALHALLA_URL;
    const client = new ValhallaClient();
    const result = await client.getManeuvers([{ lat: 51.5, lng: -0.1 }], constraints);
    expect(result.source).toBe('none');
  });
});
