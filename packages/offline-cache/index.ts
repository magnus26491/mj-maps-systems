/**
 * MJ Maps — Offline Cache Engine
 *
 * Three layers:
 *   L1 — Zustand in-memory store (instant, cleared on app kill)
 *   L2 — expo-sqlite (persists across app kills, survives no-signal indefinitely)
 *   L3 — Background sync queue (flushes to server when signal returns)
 *
 * Everything a driver needs for a full shift is written to L2 at shift-start
 * while signal is guaranteed. After that, zero network required.
 */

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'mjmaps_offline.db';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await bootstrap(_db);
  return _db;
}

// ─── Schema ────────────────────────────────────────────────────────────────

async function bootstrap(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS shifts (
      id          TEXT PRIMARY KEY,
      cached_at   INTEGER NOT NULL,
      payload     TEXT NOT NULL  -- full enriched route JSON
    );

    CREATE TABLE IF NOT EXISTS stops (
      id              TEXT PRIMARY KEY,
      shift_id        TEXT NOT NULL,
      seq             INTEGER NOT NULL,
      address         TEXT NOT NULL,
      lat             REAL NOT NULL,
      lng             REAL NOT NULL,
      plus_code       TEXT,
      access_notes    TEXT,
      turn_level      TEXT NOT NULL DEFAULT 'GREEN',
      road_width_m    REAL,
      status          TEXT NOT NULL DEFAULT 'PENDING',
      requires_sig    INTEGER NOT NULL DEFAULT 0,
      parcel_count    INTEGER NOT NULL DEFAULT 1,
      weight_kg       REAL,
      pod_photo_uri   TEXT,
      pod_sig_uri     TEXT,
      completed_at    INTEGER,
      fail_reason     TEXT,
      synced          INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_stops_shift ON stops(shift_id, seq);

    CREATE TABLE IF NOT EXISTS sync_queue (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  INTEGER NOT NULL,
      endpoint    TEXT NOT NULL,
      method      TEXT NOT NULL DEFAULT 'POST',
      body        TEXT NOT NULL,
      attempts    INTEGER NOT NULL DEFAULT 0,
      last_error  TEXT
    );

    CREATE TABLE IF NOT EXISTS geocache (
      address_key TEXT PRIMARY KEY,  -- normalised address string
      lat         REAL NOT NULL,
      lng         REAL NOT NULL,
      plus_code   TEXT,
      confidence  REAL NOT NULL DEFAULT 0,
      source      TEXT NOT NULL DEFAULT 'geoapify',
      verified    INTEGER NOT NULL DEFAULT 0,  -- 1 = driver-confirmed 3+ times
      confirm_count INTEGER NOT NULL DEFAULT 0,
      cached_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tile_regions (
      id          TEXT PRIMARY KEY,
      shift_id    TEXT NOT NULL,
      bounds_json TEXT NOT NULL,
      zoom_min    INTEGER NOT NULL DEFAULT 12,
      zoom_max    INTEGER NOT NULL DEFAULT 17,
      downloaded  INTEGER NOT NULL DEFAULT 0,
      tile_count  INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ─── Shift caching (called at shift-start while online) ───────────────────

export async function cacheShift(shiftId: string, payload: object): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO shifts (id, cached_at, payload) VALUES (?, ?, ?)`,
    shiftId,
    Date.now(),
    JSON.stringify(payload)
  );
}

export async function getCachedShift(shiftId: string): Promise<object | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ payload: string }>(
    `SELECT payload FROM shifts WHERE id = ?`,
    shiftId
  );
  return row ? JSON.parse(row.payload) : null;
}

// ─── Stop operations (fully offline) ─────────────────────────────────────

export async function upsertStops(stops: OfflineStop[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const s of stops) {
      await db.runAsync(
        `INSERT OR REPLACE INTO stops
         (id, shift_id, seq, address, lat, lng, plus_code, access_notes,
          turn_level, road_width_m, status, requires_sig, parcel_count, weight_kg)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        s.id, s.shiftId, s.seq, s.address, s.lat, s.lng,
        s.plusCode ?? null, s.accessNotes ?? null,
        s.turnLevel, s.roadWidthM ?? null,
        s.status, s.requiresSig ? 1 : 0,
        s.parcelCount, s.weightKg ?? null
      );
    }
  });
}

export async function markStopComplete(
  stopId: string,
  podPhotoUri?: string,
  podSigUri?: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE stops SET status='COMPLETED', completed_at=?, pod_photo_uri=?, pod_sig_uri=?, synced=0 WHERE id=?`,
    Date.now(), podPhotoUri ?? null, podSigUri ?? null, stopId
  );
  await enqueueSync(`/api/v1/stops/${stopId}/complete`, 'POST', {
    completedAt: Date.now(),
    podPhotoUri,
    podSigUri,
  });
}

export async function markStopFailed(stopId: string, reason: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE stops SET status='FAILED', fail_reason=?, completed_at=?, synced=0 WHERE id=?`,
    reason, Date.now(), stopId
  );
  await enqueueSync(`/api/v1/stops/${stopId}/fail`, 'POST', { reason, failedAt: Date.now() });
}

export async function getStopsForShift(shiftId: string): Promise<OfflineStop[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<DbStopRow>(
    `SELECT * FROM stops WHERE shift_id = ? ORDER BY seq ASC`,
    shiftId
  );
  return rows.map(dbRowToStop);
}

// ─── Geocache (offline address lookup) ────────────────────────────────────

export async function geocacheLookup(addressKey: string): Promise<GeocacheEntry | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<GeocacheEntry>(
    `SELECT * FROM geocache WHERE address_key = ?`,
    addressKey
  );
  return row ?? null;
}

export async function geocacheWrite(entry: GeocacheEntry): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO geocache
     (address_key, lat, lng, plus_code, confidence, source, verified, confirm_count, cached_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    entry.address_key, entry.lat, entry.lng, entry.plus_code ?? null,
    entry.confidence, entry.source, entry.verified ? 1 : 0,
    entry.confirm_count, Date.now()
  );
}

export async function incrementPinConfirmation(addressKey: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE geocache
     SET confirm_count = confirm_count + 1,
         verified = CASE WHEN confirm_count + 1 >= 3 THEN 1 ELSE 0 END
     WHERE address_key = ?`,
    addressKey
  );
}

// ─── Sync queue ────────────────────────────────────────────────────────────

export async function enqueueSync(endpoint: string, method: string, body: object): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_queue (created_at, endpoint, method, body) VALUES (?,?,?,?)`,
    Date.now(), endpoint, method, JSON.stringify(body)
  );
}

export async function flushSyncQueue(baseUrl: string, authToken: string): Promise<void> {
  const db = await getDb();
  const queue = await db.getAllAsync<SyncQueueRow>(
    `SELECT * FROM sync_queue WHERE attempts < 5 ORDER BY created_at ASC LIMIT 50`
  );

  for (const item of queue) {
    try {
      const res = await fetch(`${baseUrl}${item.endpoint}`, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: item.body,
      });
      if (res.ok) {
        await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, item.id);
      } else {
        await db.runAsync(
          `UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
          `HTTP ${res.status}`, item.id
        );
      }
    } catch (e: any) {
      await db.runAsync(
        `UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
        e.message, item.id
      );
    }
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface OfflineStop {
  id: string;
  shiftId: string;
  seq: number;
  address: string;
  lat: number;
  lng: number;
  plusCode?: string;
  accessNotes?: string;
  turnLevel: 'GREEN' | 'AMBER' | 'RED';
  roadWidthM?: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  requiresSig: boolean;
  parcelCount: number;
  weightKg?: number;
}

interface GeocacheEntry {
  address_key: string;
  lat: number;
  lng: number;
  plus_code?: string;
  confidence: number;
  source: string;
  verified: boolean;
  confirm_count: number;
}

interface DbStopRow {
  id: string; shift_id: string; seq: number; address: string;
  lat: number; lng: number; plus_code: string | null; access_notes: string | null;
  turn_level: string; road_width_m: number | null; status: string;
  requires_sig: number; parcel_count: number; weight_kg: number | null;
  pod_photo_uri: string | null; pod_sig_uri: string | null;
  completed_at: number | null; fail_reason: string | null; synced: number;
}

interface SyncQueueRow {
  id: number; created_at: number; endpoint: string;
  method: string; body: string; attempts: number; last_error: string | null;
}

function dbRowToStop(r: DbStopRow): OfflineStop {
  return {
    id: r.id, shiftId: r.shift_id, seq: r.seq, address: r.address,
    lat: r.lat, lng: r.lng, plusCode: r.plus_code ?? undefined,
    accessNotes: r.access_notes ?? undefined,
    turnLevel: r.turn_level as 'GREEN' | 'AMBER' | 'RED',
    roadWidthM: r.road_width_m ?? undefined,
    status: r.status as 'PENDING' | 'COMPLETED' | 'FAILED',
    requiresSig: r.requires_sig === 1,
    parcelCount: r.parcel_count,
    weightKg: r.weight_kg ?? undefined,
  };
}
