/**
 * DB helpers for driver_sessions table.
 * Kept separate from index.ts to avoid circular imports with auth service.
 */

import { pool } from './index';

export interface SessionRow {
  id: string;
  driver_id: string;
  token_hash: string;
  device_info: string | null;
  expires_at: Date;
  created_at: Date;
}

export async function createSession(data: {
  driverId: string;
  tokenHash: string;
  deviceInfo?: string;
  expiresAt: Date;
}): Promise<SessionRow> {
  const { rows } = await pool.query<SessionRow>(
    `INSERT INTO driver_sessions (driver_id, token_hash, device_info, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.driverId, data.tokenHash, data.deviceInfo ?? null, data.expiresAt],
  );
  return rows[0];
}

export async function getSessionByTokenHash(tokenHash: string): Promise<SessionRow | null> {
  const { rows } = await pool.query<SessionRow>(
    `SELECT * FROM driver_sessions WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await pool.query(`DELETE FROM driver_sessions WHERE token_hash = $1`, [tokenHash]);
}

export async function deleteAllSessionsForDriver(driverId: string): Promise<void> {
  await pool.query(`DELETE FROM driver_sessions WHERE driver_id = $1`, [driverId]);
}

export async function pruneExpiredSessions(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM driver_sessions WHERE expires_at <= NOW()`,
  );
  return rowCount ?? 0;
}

/** Get full driver row by ID (used in auth middleware). */
export async function getDriverById(id: string): Promise<{
  id: string;
  name: string;
  email: string;
  role: string;
  vehicle_id: string;
  active: boolean;
} | null> {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, vehicle_id, active FROM drivers WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Get driver by email for login (includes password_hash). */
export async function getDriverByEmail(email: string): Promise<{
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  vehicle_id: string;
  active: boolean;
} | null> {
  const { rows } = await pool.query(
    `SELECT id, name, email, password_hash, role, vehicle_id, active FROM drivers WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}
