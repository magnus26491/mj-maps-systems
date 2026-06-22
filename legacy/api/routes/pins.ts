/**
 * api/routes/pins.ts — Driver pin confirm loop API
 *
 * POST /api/v1/pins/confirm
 *   Body: { address: string; lat: number; lng: number }
 *   Upserts a driver-confirmed geocode pin into geocode_pins.
 *   Multi-driver consensus (>= 3 contributors) raises confidence to 2.
 *
 * GET /api/v1/pins/lookup?address=<string>
 *   Returns the verified pin for an address, or { found: false }.
 *   Public — no auth required.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../services/db/index.js';
import { normaliseAddress } from '../../services/postcode-resolver/index.js';
import { authenticateDriver } from '../middleware/authenticate.js';

export const pinsRouter = Router();

// ── POST /api/v1/pins/confirm ─────────────────────────────────────────────────

interface ConfirmBody {
  address?: unknown;
  lat?: unknown;
  lng?: unknown;
}

interface GeoPinRow {
  id: string;
  normalised_address: string;
  lat: number;
  lng: number;
  confidence: number;
  contributor_count: number;
  last_confirmed_at: Date;
}

pinsRouter.post('/confirm', authenticateDriver, async (req: Request, res: Response) => {
  const { address, lat, lng } = req.body as ConfirmBody;

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!address || typeof address !== 'string' || address.trim() === '') {
    res.status(400).json({ success: false, error: 'address is required and must be a non-empty string.' });
    return;
  }

  const latNum = typeof lat === 'number' ? lat : parseFloat(String(lat));
  const lngNum = typeof lng === 'number' ? lng : parseFloat(String(lng));

  if (isNaN(latNum) || latNum < -90 || latNum > 90) {
    res.status(400).json({ success: false, error: 'lat must be a number between -90 and 90.' });
    return;
  }
  if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
    res.status(400).json({ success: false, error: 'lng must be a number between -180 and 180.' });
    return;
  }

  const normalised = normaliseAddress(String(address).trim());

  try {
    const { rows } = await pool.query<GeoPinRow>(
      `INSERT INTO geocode_pins (normalised_address, lat, lng, confidence, contributor_count)
       VALUES ($1, $2, $3, 1, 1)
       ON CONFLICT (normalised_address) DO UPDATE SET
         lat                  = EXCLUDED.lat,
         lng                  = EXCLUDED.lng,
         contributor_count   = geocode_pins.contributor_count + 1,
         confidence           = CASE
           WHEN geocode_pins.contributor_count + 1 >= 3 THEN 2
           ELSE 1
         END,
         last_confirmed_at    = NOW()
       RETURNING normalised_address, lat, lng, confidence, contributor_count`,
      [normalised, latNum, lngNum],
    );

    const row = rows[0];
    res.json({
      success:           true,
      normalisedAddress: row.normalised_address,
      lat:               row.lat,
      lng:               row.lng,
      confidence:        row.confidence,
      contributorCount:  row.contributor_count,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: `Database error: ${msg}` });
  }
});

// ── GET /api/v1/pins/lookup ─────────────────────────────────────────────────────

interface LookupRow {
  lat: number;
  lng: number;
  confidence: number;
  contributor_count: number;
}

pinsRouter.get('/lookup', async (req: Request, res: Response) => {
  const address = req.query.address;
  if (!address || typeof address !== 'string') {
    res.status(400).json({ success: false, error: 'address query parameter is required.' });
    return;
  }

  const normalised = normaliseAddress(address.trim());

  try {
    const { rows } = await pool.query<LookupRow>(
      `SELECT lat, lng, confidence, contributor_count
       FROM geocode_pins
       WHERE normalised_address = $1 AND confidence >= 1
       LIMIT 1`,
      [normalised],
    );

    if (rows.length === 0) {
      res.json({ found: false });
      return;
    }

    res.json({
      found:            true,
      lat:              rows[0].lat,
      lng:              rows[0].lng,
      confidence:       rows[0].confidence,
      contributorCount: rows[0].contributor_count,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: `Database error: ${msg}` });
  }
});
