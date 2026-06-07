/**
 * __tests__/podOutbox.test.ts
 *
 * Tests for the SQLite outbox enqueue logic.
 * Uses the mocked expo-sqlite from jest.setup.js.
 */
import * as SQLite from 'expo-sqlite';
import { enqueuePod, getPendingCount } from '../lib/podOutbox';

describe('podOutbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('enqueuePod calls db.runAsync with correct params', async () => {
    const mockDb = {
      execAsync:    jest.fn().mockResolvedValue(undefined),
      runAsync:     jest.fn().mockResolvedValue(undefined),
      getAllAsync:   jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
    };
    (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);

    await enqueuePod({
      idempotencyKey: 'stop-1_12345',
      stopId:         'stop-1',
      photoUri:       'file://test.jpg',
      signatureSvg:   null,
      barcodeValue:   null,
      outcome:        'delivered',
      failureReason:  null,
      capturedAt:     12345,
    });

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE'),
      expect.arrayContaining(['stop-1_12345', 'stop-1', 'file://test.jpg']),
    );
  });

  it('getPendingCount returns 0 when queue is empty', async () => {
    const mockDb = {
      execAsync:    jest.fn().mockResolvedValue(undefined),
      runAsync:     jest.fn().mockResolvedValue(undefined),
      getAllAsync:   jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
    };
    (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDb);
    const count = await getPendingCount();
    expect(count).toBe(0);
  });
});