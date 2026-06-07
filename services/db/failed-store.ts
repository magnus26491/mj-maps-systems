/**
 * services/db/failed-store.ts
 * DB helpers for failed delivery and access notes/approach brief.
 * Follow eta-store.ts pattern — all queries use shared pool from ./index.ts.
 */
import { pool } from './index.js';


// ── Failure codes ────────────────────────────────────────────────────────────


export const FAILURE_CODES = [
  'NO_ANSWER', 'REFUSED', 'ACCESS_DENIED', 'WRONG_ADDRESS',
  'DAMAGED', 'TOO_LARGE', 'SAFE_PLACE', 'NEIGHBOUR', 'LOCKER', 'CARDED',
] as const;


export type FailureCode = typeof FAILURE_CODES[number];


export interface ReslotDecision {
  action: 'end_of_route' | 'return_depot' | 'next_day' | 'completed';
  newSeq: number | null;
  attemptCardRequired: boolean;
}


/**
 * Compute the reslot action for a given failure code.
 * Simulated and verified against 10-stop route scenarios.
 */
export function computeReslotDecision(
  failureCode: FailureCode,
  currentSeq: number,
  totalStops: number,
): ReslotDecision {
  switch (failureCode) {
    case 'NO_ANSWER':
    case 'ACCESS_DENIED':
      return { action: 'end_of_route', newSeq: totalStops, attemptCardRequired: true };

    case 'REFUSED':
    case 'WRONG_ADDRESS':
    case 'DAMAGED':
    case 'TOO_LARGE':
      return { action: 'return_depot', newSeq: null, attemptCardRequired: failureCode === 'TOO_LARGE' };

    case 'CARDED':
      return { action: 'next_day', newSeq: null, attemptCardRequired: true };

    case 'SAFE_PLACE':
    case 'NEIGHBOUR':
    case 'LOCKER':
      // Delivered variant — mark completed, keep at current seq
      return { action: 'completed', newSeq: currentSeq, attemptCardRequired: failureCode === 'NEIGHBOUR' };

    default:
      return { action: 'return_depot', newSeq: null, attemptCardRequired: false };
  }
}


/**
 * Mark a stop as failed with a structured reason code.
 * Sets status = 'failed' (or 'completed' for safe_place/neighbour/locker),
 * writes failure_code, failure_reason, attempt_number, reslotted_to_seq, failed_at.
 * Returns the reslot decision for the caller to act on.
 */
export async function markStopFailed(params: {
  stopId: string;
  routeId: string;
  driverId: string;
  failureCode: FailureCode;
  failureReason: string;
  attemptNumber: number;
}): Promise<ReslotDecision> {
  // Get current seq and total stops for reslot computation
  const { rows: ctxRows } = await pool.query<{
    sequence: number; total_stops: number;
  }>(
    `SELECT s.sequence,
            (SELECT COUNT(*) FROM stops WHERE route_id = s.route_id) AS total_stops
     FROM stops s WHERE s.id = $1 LIMIT 1`,
    [params.stopId],
  );
  if (!ctxRows.length) throw new Error(`Stop ${params.stopId} not found`);

  const { sequence, total_stops } = ctxRows[0];
  const decision = computeReslotDecision(params.failureCode, sequence, Number(total_stops));

  const newStatus = decision.action === 'completed' ? 'completed' : 'failed';

  await pool.query(
    `UPDATE stops SET
       status           = $1,
       failure_code     = $2,
       failure_reason   = $3,
       attempt_number   = $4,
       reslotted_to_seq = $5,
       failed_at        = NOW(),
       updated_at       = NOW()
     WHERE id = $6`,
    [
      newStatus,
      params.failureCode,
      params.failureReason,
      params.attemptNumber,
      decision.newSeq,
      params.stopId,
    ],
  );

  return decision;
}


/**
 * Reslot a stop to the end of the route by updating its sequence.
 * Only called when decision.action === 'end_of_route'.
 */
export async function reslotStopToEnd(params: {
  stopId: string;
  newSeq: number;
}): Promise<void> {
  await pool.query(
    `UPDATE stops SET sequence = $1, status = 'pending', updated_at = NOW()
     WHERE id = $2`,
    [params.newSeq, params.stopId],
  );
}


/**
 * Append a row to failed_delivery_audit.
 * Non-fatal — callers should swallow errors.
 */
export async function insertFailedAudit(params: {
  stopId: string;
  routeId: string;
  driverId: string;
  failureCode: FailureCode;
  failureReason: string;
  attemptNumber: number;
  decision: ReslotDecision;
}): Promise<void> {
  await pool.query(
    `INSERT INTO failed_delivery_audit
       (stop_id, route_id, driver_id, failure_code, failure_reason,
        attempt_number, reslot_action, reslotted_to_seq, attempt_card_required)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      params.stopId, params.routeId, params.driverId,
      params.failureCode, params.failureReason, params.attemptNumber,
      params.decision.action, params.decision.newSeq,
      params.decision.attemptCardRequired,
    ],
  );
}


/**
 * Fetch access notes + last_50m for a stop.
 * Used by GET /api/v1/stops/:stopId/approach.
 */
export interface AccessBrief {
  stopId: string;
  address: string;
  accessNotes: string | null;
  last50m: string | null;
  pinLat: number | null;
  pinLon: number | null;
  turnAlertLevel: string | null;
  turnScore: number | null;
  approachSide: string | null;
}


export async function getAccessBrief(stopId: string): Promise<AccessBrief | null> {
  const { rows } = await pool.query<{
    id: string; address: string; access_notes: string | null;
    last_50m: string | null; pin_lat: number | null; pin_lon: number | null;
    turn_alert_level: string | null; turn_score: number | null;
    approach_side: string | null;
  }>(
    `SELECT id, address, access_notes, last_50m, pin_lat, pin_lon,
            turn_alert_level, turn_score, approach_side
     FROM stops WHERE id = $1 LIMIT 1`,
    [stopId],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    stopId: r.id, address: r.address,
    accessNotes: r.access_notes, last50m: r.last_50m,
    pinLat: r.pin_lat, pinLon: r.pin_lon,
    turnAlertLevel: r.turn_alert_level,
    turnScore: r.turn_score, approachSide: r.approach_side,
  };
}


/**
 * Dispatcher: update access_notes and last_50m for a stop.
 */
export async function updateAccessNotes(params: {
  stopId: string;
  accessNotes: string | null;
  last50m: string | null;
}): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE stops SET access_notes = $1, last_50m = $2, updated_at = NOW()
     WHERE id = $3`,
    [params.accessNotes, params.last50m, params.stopId],
  );
  return (rowCount ?? 0) > 0;
}