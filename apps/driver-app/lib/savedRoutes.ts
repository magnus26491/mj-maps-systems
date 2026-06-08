import * as SQLite from 'expo-sqlite';
import type { SavedRoute, Stop } from './types';

const DB_NAME = 'mj_maps.db';   // same db as podOutbox

async function getDb() {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS saved_routes (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      stops_json   TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      last_used_at TEXT
    );
  `);
  return db;
}

export async function saveRoute(name: string, stops: Stop[]): Promise<SavedRoute> {
  const db   = await getDb();
  const id   = `sr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now  = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO saved_routes (id, name, stops_json, created_at) VALUES (?, ?, ?, ?)',
    [id, name, JSON.stringify(stops), now],
  );
  return { id, name, stops, createdAt: now };
}

export async function listSavedRoutes(): Promise<SavedRoute[]> {
  const db   = await getDb();
  const rows = await db.getAllAsync<{
    id: string; name: string; stops_json: string;
    created_at: string; last_used_at: string | null;
  }>('SELECT * FROM saved_routes ORDER BY last_used_at DESC, created_at DESC');
  return rows.map(r => ({
    id:          r.id,
    name:        r.name,
    stops:       JSON.parse(r.stops_json) as Stop[],
    createdAt:   r.created_at,
    lastUsedAt:  r.last_used_at ?? undefined,
  }));
}

export async function touchSavedRoute(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE saved_routes SET last_used_at = ? WHERE id = ?',
    [new Date().toISOString(), id],
  );
}

export async function deleteSavedRoute(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM saved_routes WHERE id = ?', [id]);
}

export async function countSavedRoutes(): Promise<number> {
  const db  = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) as n FROM saved_routes'
  );
  return row?.n ?? 0;
}