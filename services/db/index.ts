/**
 * Database helpers — typed pg query wrappers
 * Uses the `pg` Pool. Connection string from POSTGRES_URL env var.
 * Supports DATABASE_URL (Railway) as fallback for POSTGRES_URL.
 */

import { Pool } from 'pg';

function resolveConnectionString(): string {
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      '[db] No database connection string found. ' +
      'Set DATABASE_URL or POSTGRES_URL environment variable.',
    );
  }
  return url;
}

export const pool = new Pool({
  connectionString: resolveConnectionString(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => console.error('[db] Pool error:', err.message));

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TurnReportRow {
  id: string;
  driver_id: string | null;
  stop_id: string | null;
  lat: number;
  lon: number;
  vehicle_id: string;
  could_turn: boolean;
  had_to_reverse: boolean;
  road_width_est: number | null;
  notes: string | null;
  created_at: Date;
}

export interface CommunityScoreRow {
  lat_bucket: number;
  lon_bucket: number;
  vehicle_id: string;
  report_count: number;
  score: number;
  updated_at: Date;
}

export interface StopRow {
  id: string;
  route_id: string;
  stop_ref: string;
  address: string;
  pin_lat: number | null;
  pin_lon: number | null;
  status: string;
  turn_alert_level: string | null;
  turn_score: number | null;
  created_at: Date;
}

// ── Turn reports ──────────────────────────────────────────────────────────────

export async function insertTurnReport(data: {
  driverId?: string;
  stopId?: string;
  lat: number;
  lon: number;
  vehicleId: string;
  couldTurn: boolean;
  hadToReverse: boolean;
  roadWidthEst?: number;
  notes?: string;
}): Promise<TurnReportRow> {
  const { rows } = await pool.query<TurnReportRow>(
    `INSERT INTO turn_reports
       (driver_id, stop_id, lat, lon, vehicle_id, could_turn, had_to_reverse, road_width_est, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      data.driverId ?? null,
      data.stopId ?? null,
      data.lat,
      data.lon,
      data.vehicleId,
      data.couldTurn,
      data.hadToReverse,
      data.roadWidthEst ?? null,
      data.notes ?? null,
    ],
  );
  return rows[0];
}

export async function getCommunityScore(
  lat: number,
  lon: number,
  vehicleId: string,
): Promise<CommunityScoreRow | null> {
  const bucket_lat = Math.round(lat * 10000) / 10000;
  const bucket_lon = Math.round(lon * 10000) / 10000;
  const { rows } = await pool.query<CommunityScoreRow>(
    `SELECT * FROM community_scores
     WHERE lat_bucket = $1 AND lon_bucket = $2 AND vehicle_id = $3`,
    [bucket_lat, bucket_lon, vehicleId],
  );
  return rows[0] ?? null;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function createRoute(data: {
  driverId?: string;
  vehicleId: string;
  depotLat: number;
  depotLon: number;
  shiftStart: Date;
  totalStops: number;
  rawResult: unknown;
}): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO routes (driver_id, vehicle_id, depot_lat, depot_lon, shift_start, total_stops, raw_result)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      data.driverId ?? null,
      data.vehicleId,
      data.depotLat,
      data.depotLon,
      data.shiftStart,
      data.totalStops,
      JSON.stringify(data.rawResult),
    ],
  );
  return rows[0].id as string;
}

export async function updateRouteStatus(
  routeId: string,
  status: 'active' | 'completed' | 'abandoned',
  extras?: { completedStops?: number; failedStops?: number; actualCompletion?: Date },
): Promise<void> {
  await pool.query(
    `UPDATE routes
     SET status = $1,
         completed_stops = COALESCE($2, completed_stops),
         failed_stops    = COALESCE($3, failed_stops),
         actual_completion = COALESCE($4, actual_completion),
         updated_at = NOW()
     WHERE id = $5`,
    [
      status,
      extras?.completedStops ?? null,
      extras?.failedStops ?? null,
      extras?.actualCompletion ?? null,
      routeId,
    ],
  );
}

// ── Stops ─────────────────────────────────────────────────────────────────────

export async function updateStopStatus(
  stopId: string,
  status: 'completed' | 'failed' | 'skipped',
  extras?: {
    actualArrival?: Date;
    actualDeparture?: Date;
    failureReason?: string;
    proofPhotoUrl?: string;
  },
): Promise<void> {
  await pool.query(
    `UPDATE stops
     SET status = $1,
         actual_arrival   = COALESCE($2, actual_arrival),
         actual_departure = COALESCE($3, actual_departure),
         failure_reason   = COALESCE($4, failure_reason),
         proof_photo_url  = COALESCE($5, proof_photo_url),
         updated_at = NOW()
     WHERE id = $6`,
    [
      status,
      extras?.actualArrival ?? null,
      extras?.actualDeparture ?? null,
      extras?.failureReason ?? null,
      extras?.proofPhotoUrl ?? null,
      stopId,
    ],
  );
}
