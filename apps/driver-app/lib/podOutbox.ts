/**
 * lib/podOutbox.ts
 *
 * SQLite outbox for POD uploads.
 * All POD submissions go through here to guarantee no data loss
 * if the connection drops mid-shift.
 *
 * Guarantees:
 *  · INSERT OR IGNORE with idempotency key — no double-submit on app restart
 *  · Exponential backoff: 2^retryCount seconds between retries
 *  · Max 3 retries before marking as dead-letter (status='error')
 *  · FIFO processing — oldest entries first
 */
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';

const DB_NAME = 'mj_pod_outbox.db';
const TABLE   = 'pod_outbox';

export interface OutboxEntry {
  id:            number;
  idempotencyKey: string;
  stopId:        string;
  photoUri:      string | null;
  signatureSvg:  string | null;
  barcodeValue:  string | null;
  outcome:       'delivered' | 'redeliver' | 'failed';
  failureReason: string | null;
  capturedAt:    number;
  retryCount:    number;
  status:        'pending' | 'uploading' | 'done' | 'error';
  createdAt:     number;
}

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      idempotencyKey   TEXT UNIQUE NOT NULL,
      stopId           TEXT NOT NULL,
      photoUri         TEXT,
      signatureSvg     TEXT,
      barcodeValue     TEXT,
      outcome          TEXT NOT NULL,
      failureReason    TEXT,
      capturedAt       INTEGER NOT NULL,
      retryCount       INTEGER DEFAULT 0,
      status           TEXT DEFAULT 'pending',
      createdAt        INTEGER NOT NULL
    );
  `);
  return _db;
}

/**
 * Write a POD entry to the outbox immediately.
 * Uses INSERT OR IGNORE so duplicate idempotencyKey is silently skipped.
 */
export async function enqueuePod(
  entry: Omit<OutboxEntry, 'id' | 'retryCount' | 'status' | 'createdAt'>,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO ${TABLE}
     (idempotencyKey, stopId, photoUri, signatureSvg, barcodeValue, outcome, failureReason, capturedAt, retryCount, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?)`,
    [
      entry.idempotencyKey,
      entry.stopId,
      entry.photoUri ?? null,
      entry.signatureSvg ?? null,
      entry.barcodeValue ?? null,
      entry.outcome,
      entry.failureReason ?? null,
      entry.capturedAt,
      Date.now(),
    ],
  );
}

/**
 * Drain all pending entries. Call this when NetInfo reports isConnected.
 * Processes FIFO. Max 3 retries per entry before marking as 'error'.
 * Uses exponential backoff: 2^retryCount seconds between retries.
 */
export async function drainOutbox(apiBaseUrl: string): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxEntry>(
    `SELECT * FROM ${TABLE}
     WHERE status IN ('pending', 'error') AND retryCount < 3
     ORDER BY createdAt ASC`,
  );

  for (const row of rows) {
    // Exponential backoff gate
    if (row.retryCount > 0) {
      const backoffMs = Math.pow(2, row.retryCount) * 1000;
      const elapsed   = Date.now() - row.createdAt;
      if (elapsed < backoffMs) continue;
    }

    await db.runAsync(`UPDATE ${TABLE} SET status='uploading' WHERE id=?`, [row.id]);

    try {
      await uploadPodEntry(row, apiBaseUrl);
      await db.runAsync(`UPDATE ${TABLE} SET status='done' WHERE id=?`, [row.id]);
    } catch {
      const newRetry  = row.retryCount + 1;
      const newStatus = newRetry >= 3 ? 'error' : 'pending';
      await db.runAsync(
        `UPDATE ${TABLE} SET status=?, retryCount=? WHERE id=?`,
        [newStatus, newRetry, row.id],
      );
    }
  }
}

/**
 * Upload a single POD entry as multipart/form-data using expo/fetch.
 * Uses File objects from expo-file-system — NOT base64.
 * The server endpoint is POST /api/v1/pod
 */
async function uploadPodEntry(entry: OutboxEntry, apiBaseUrl: string): Promise<void> {
  const form = new FormData();
  form.append('stopId',         entry.stopId);
  form.append('idempotencyKey', entry.idempotencyKey);
  form.append('outcome',        entry.outcome);
  form.append('capturedAt',     String(entry.capturedAt));
  if (entry.failureReason) form.append('failureReason', entry.failureReason);
  if (entry.barcodeValue)  form.append('barcodeValue',  entry.barcodeValue);
  if (entry.signatureSvg)  form.append('signatureSvg',  entry.signatureSvg);

  if (entry.photoUri) {
    // Use expo-file-system File object — avoids base64 overhead
    const file = new FileSystem.File(entry.photoUri);
    form.append('photo', file as unknown as Blob, `pod_${entry.stopId}.jpg`);
  }

  const response = await expoFetch(`${apiBaseUrl}/api/v1/pod`, {
    method:  'POST',
    body:    form,
  });

  if (!response.ok) {
    throw new Error(`POD upload failed: ${response.status}`);
  }
}

/** Purge completed entries older than 7 days (housekeeping) */
export async function purgeOldEntries(): Promise<void> {
  const db     = await getDb();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  await db.runAsync(
    `DELETE FROM ${TABLE} WHERE status='done' AND createdAt < ?`,
    [cutoff],
  );
}

/** Get count of entries still pending/error — for UI badge */
export async function getPendingCount(): Promise<number> {
  const db     = await getDb();
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${TABLE}
     WHERE status IN ('pending', 'uploading', 'error')`,
  );
  return result?.count ?? 0;
}