/**
 * services/db/pod-store.ts
 * DB helpers for POD photo audit trail.
 * All operations use the shared pool from ./index.ts.
 */
import { pool } from './index.js';


export async function setStopProofPhotoUrl(params: {
  stopId: string;
  proofPhotoUrl: string;
}): Promise<void> {
  await pool.query(
    `UPDATE stops SET
       proof_photo_url  = $1,
       status           = CASE WHEN status = 'arrived' THEN 'completed' ELSE status END,
       actual_departure = CASE WHEN status = 'arrived' THEN NOW() ELSE actual_departure END,
       updated_at       = NOW()
     WHERE id = $2`,
    [params.proofPhotoUrl, params.stopId],
  );
}


export async function insertPodAuditRow(params: {
  stopId: string;
  userId: string;
  objectKey: string;
  proofPhotoUrl: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO pod_uploads
       (stop_id, uploaded_by_user_id, object_key, photo_url)
     VALUES ($1, $2, $3, $4)`,
    [params.stopId, params.userId, params.objectKey, params.proofPhotoUrl],
  );
}


export async function getStopForPod(stopId: string): Promise<{
  id: string;
  routeId: string;
  status: string;
  proofPhotoUrl: string | null;
} | null> {
  const { rows } = await pool.query<{
    id: string; route_id: string; status: string; proof_photo_url: string | null;
  }>(
    'SELECT id, route_id, status, proof_photo_url FROM stops WHERE id = $1 LIMIT 1',
    [stopId],
  );
  if (!rows[0]) return null;
  return {
    id:           rows[0].id,
    routeId:      rows[0].route_id,
    status:       rows[0].status,
    proofPhotoUrl: rows[0].proof_photo_url,
  };
}
