/**
 * POST /api/v1/stops/:stopId/confirm-pin
 * ---
 * Allows a driver to confirm or correct a stop's GPS pin.
 * After 3 confirmations, the pin is marked verified and cached in Redis.
 *
 * Body: { confirmed: boolean, correctedLat?: number, correctedLng?: number }
 * Returns: 204 No Content
 *
 * Auth: Bearer JWT (authenticateDriver middleware)
 */
import { Router, Request, Response } from 'express';
import { authenticateDriver } from '../middleware/authenticate';
import { pool } from '../../services/db';
import { invalidatePinCache } from '../../services/cache';

export const pinConfirmRouter = Router({ mergeParams: true });

pinConfirmRouter.post(
  '/',
  authenticateDriver,
  async (req: Request, res: Response) => {
    const stopId = req.params.stopId;
    const { confirmed, correctedLat, correctedLng } = req.body as {
      confirmed: boolean;
      correctedLat?: number;
      correctedLng?: number;
    };

    if (typeof confirmed !== 'boolean') {
      res.status(400).json({ success: false, error: 'Body requires "confirmed" boolean.' });
      return;
    }

    try {
      // 1. Load stop + verify driverId matches assigned route
      const stopResult = await pool.query<{ driver_id: string; address: string }>(
        `SELECT driver_id, address FROM stops WHERE id = $1 LIMIT 1`,
        [stopId],
      );
      if (!stopResult.rows.length) {
        res.status(404).json({ success: false, error: 'Stop not found.' });
        return;
      }
      const stop = stopResult.rows[0];
      const driverId = (req as any).user?.id;
      if (stop.driver_id !== driverId) {
        res.status(403).json({ success: false, error: 'Not authorized to confirm this stop.' });
        return;
      }

      // 2. Update pin corrections if provided
      if (confirmed && correctedLat !== undefined && correctedLng !== undefined) {
        await pool.query(
          `UPDATE stops SET
             pin_corrected_lat = $1,
             pin_corrected_lng = $2,
             normalised_address = LOWER(TRIM(REGEXP_REPLACE($3, '\s+', ' ', 'g')))
           WHERE id = $4`,
          [correctedLat, correctedLng, stop.address, stopId],
        );
      }

      // 3. Increment verify count
      await pool.query(
        `UPDATE stops SET pin_verify_count = pin_verify_count + 1 WHERE id = $1`,
        [stopId],
      );

      // 4. Check count — if >= 3, mark verified and invalidate Redis cache
      const countResult = await pool.query<{ pin_verify_count: number; address: string }>(
        `SELECT pin_verify_count, address FROM stops WHERE id = $1`,
        [stopId],
      );
      if (countResult.rows[0].pin_verify_count >= 3) {
        await pool.query(
          `UPDATE stops SET pin_verified = TRUE, pin_verified_at = NOW() WHERE id = $1`,
          [stopId],
        );
        const normalised = stop.address.toLowerCase().replace(/\s+/g, ' ').trim();
        await invalidatePinCache(normalised);
      }

      res.status(204).send();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  },
);