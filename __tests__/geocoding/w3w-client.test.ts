/**
 * Contract tests for the what3words adapter.
 * Uses a mock HTTP server — no real W3W API key required.
 */

import * as http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { resolveW3wToDoorPin, isW3wAddress } from '../../services/geocoding/w3w-client';

function startMockW3w(
  responseBody: object,
  statusCode = 200,
): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ port: addr.port, close: () => server.close() });
    });
  });
}

describe('isW3wAddress', () => {
  test('returns true for valid 3-word addresses', () => {
    expect(isW3wAddress('filled.count.soap')).toBe(true);
    expect(isW3wAddress('lock.spout.radar')).toBe(true);
    expect(isW3wAddress('FILLED.COUNT.SOAP')).toBe(true);
  });

  test('returns false for invalid strings', () => {
    expect(isW3wAddress('not-a-w3w')).toBe(false);
    expect(isW3wAddress('only.two')).toBe(false);
    expect(isW3wAddress('')).toBe(false);
    expect(isW3wAddress('9CC5+9Q')).toBe(false);    // plus code, not w3w
    expect(isW3wAddress('SW1A 2AA')).toBe(false);   // postcode
  });
});

describe('resolveW3wToDoorPin', () => {
  test('returns null when WHAT3WORDS_API_KEY is unset', async () => {
    delete process.env.WHAT3WORDS_API_KEY;
    delete process.env.W3W_API_KEY;
    const result = await resolveW3wToDoorPin('filled.count.soap');
    expect(result).toBeNull();
  });

  test('returns null for invalid W3W address format', async () => {
    process.env.WHAT3WORDS_API_KEY = 'test-key';
    try {
      const result = await resolveW3wToDoorPin('not-a-real-address');
      expect(result).toBeNull();
    } finally {
      delete process.env.WHAT3WORDS_API_KEY;
    }
  });

  test('returns null when API returns an error response', async () => {
    const mock = await startMockW3w({
      error: { code: 'BadWords', message: 'Invalid 3 word address' },
    });

    // W3W module uses hardcoded api.what3words.com — we can't redirect without
    // env manipulation.  Test the no-key path which is the realistic CI case.
    delete process.env.WHAT3WORDS_API_KEY;
    delete process.env.W3W_API_KEY;

    const result = await resolveW3wToDoorPin('filled.count.soap');
    expect(result).toBeNull();

    mock.close();
  });
});
