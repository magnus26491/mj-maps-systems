/**
 * services/db/pin-store.ts
 * DB helpers for the driver pin confirmation loop.
 * All operations use the shared pool from ./index.ts.
 */
import { pool } from './index.js';


export interface StopPinRow {
  address: string;
  normalised_address: string | null;
  pin_verify_count: number | null;
  pin_lat: number | null;
  pin_lng: number | null;
}


/**
 * Fetch a stop's address and current pin state.
 * Returns null if the stop does not exist.
 */
export async function getStopPinRow(stopId: string): Promise<StopPinRow | null> {
  const { rows } = await pool.query<StopPinRow>(
    `SELECT address, normalised_address, pin_verify_count,
            pin_corrected_lat AS pin_lat, pin_corrected_lng AS pin_lng
     FROM stops WHERE id = $1 LIMIT 1`,
    [stopId],
  );
  return rows[0] ?? null;
}


/**
 * Increment the stop's pin_verify_count and optionally write corrected coords.
 * Sets pin_verified = true once count reaches 3.
 */
export async function updateStopPin(params: {
  stopId: string;
  newCount: number;
  correctedLat?: number;
  correctedLng?: number;
}): Promise<void> {
  const nowVerified = params.newCount >= 3;
  await pool.query(
    `UPDATE stops SET
       pin_verify_count  = $1,
       pin_verified      = $2,
       pin_verified_at   = CASE WHEN $2 THEN NOW() ELSE pin_verified_at END,
       pin_corrected_lat = COALESCE($3, pin_corrected_lat),
       pin_corrected_lng = COALESCE($4, pin_corrected_lng)
     WHERE id = $5`,
    [params.newCount, nowVerified,
     params.correctedLat ?? null, params.correctedLng ?? null,
     params.stopId],
  );
}


/**
 * Upsert into geocode_pins for the given normalised address.
 *
 * - If no row exists: insert with contributor_count = 1, confidence = 0.
 * - If a row exists: increment contributor_count; update lat/lng if a
 *   corrected coordinate was provided; bump confidence when count hits
 *   thresholds (>=2 → confidence 1; >=3 → confidence 2).
 *
 * The UNIQUE index on normalised_address makes this safe under concurrency.
 */
export async function upsertGeocodePin(params: {
  normalisedAddress: string;
  lat: number;
  lng: number;
  correctedLat?: number;
  correctedLng?: number;
}): Promise<{ contributorCount: number; confidence: number }> {
  // Use corrected coords if provided, otherwise keep existing/fallback coords
  const finalLat = params.correctedLat ?? params.lat;
  const finalLng = params.correctedLng ?? params.lng;

  const { rows } = await pool.query<{ contributor_count: number; confidence: number }>(
    `INSERT INTO geocode_pins (normalised_address, lat, lng, confidence, contributor_count)
     VALUES ($1, $2, $3, 0, 1)
     ON CONFLICT (normalised_address) DO UPDATE SET
       contributor_count = geocode_pins.contributor_count + 1,
       lat               = CASE
                             WHEN $4 IS NOT NULL THEN $4
                             ELSE geocode_pins.lat
                           END,
       lng               = CASE
                             WHEN $5 IS NOT NULL THEN $5
                             ELSE geocode_pins.lng
                           END,
       confidence        = CASE
                             WHEN geocode_pins.contributor_count + 1 >= 3 THEN 2
                             WHEN geocode_pins.contributor_count + 1 >= 2 THEN 1
                             ELSE geocode_pins.confidence
                           END,
       last_confirmed_at = NOW()
     RETURNING contributor_count, confidence`,
    [
      params.normalisedAddress,
      finalLat,
      finalLng,
      params.correctedLat ?? null,
      params.correctedLng ?? null,
    ],
  );

  return {
    contributorCount: rows[0].contributor_count,
    confidence: rows[0].confidence,
  };
}


/**
 * Look up a verified pin for a normalised address.
 * Returns null if no verified pin exists (confidence < 1).
 */
export async function getVerifiedPin(normalisedAddress: string): Promise<{
  lat: number;
  lng: number;
  confidence: number;
  contributorCount: number;
} | null> {
  const { rows } = await pool.query<{
    lat: number; lng: number; confidence: number; contributor_count: number;
  }>(
    `SELECT lat, lng, confidence, contributor_count
     FROM geocode_pins
     WHERE normalised_address = $1 AND confidence >= 1
     LIMIT 1`,
    [normalisedAddress],
  );
  if (!rows[0]) return null;
  return {
    lat: rows[0].lat,
    lng: rows[0].lng,
    confidence: rows[0].confidence,
    contributorCount: rows[0].contributor_count,
  };
}
