/**
 * POST /api/v1/stops/:stopId/complete
 * ---
 * Marks a stop as delivered or failed and triggers route completion check.
 *
 * Body: { status: 'delivered' | 'failed', note?: string }
 * Returns: 200 { success: true, routeCompleted: boolean }
 *
 * Auth: Bearer JWT (authenticateDriver applied at mount point)
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../services/db';
import { broadcastAlert } from './dispatcher';
import { maybeCompleteRoute } from '../../services/route-completion';

export const stopCompleteRouter = Router({ mergeParams: true });

stopCompleteRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { status } = req.body as { status?: string; note?: string };

    // 1. Validate status
    if (status !== 'delivered' && status !== 'failed') {
      res.status(400).json({
        success: false,
        error: 'Body.status must be "delivered" or "failed".',
      });
      return;
    }

    const stopId = req.params.stopId;
    const driverId = req.driver?.id;

    // 2 & 3. Atomically update the stop — only if pending and owned by this driver
    const updateResult = await pool.query<{ id: string; route_id: string; driver_id: string; status: string }>(
      `UPDATE stops
       SET status = $1
       WHERE id = $2 AND driver_id = $3 AND status = 'pending'
       RETURNING id, route_id, driver_id, status`,
      [status, stopId, driverId],
    );

    if (!updateResult.rows.length) {
      // Fallback: provide precise error messages
      const checkResult = await pool.query<{ driver_id: string; status: string }>(
        `SELECT driver_id, status FROM stops WHERE id = $1 LIMIT 1`,
        [stopId],
      );
      if (!checkResult.rows.length) {
        res.status(404).json({ success: false, error: 'Stop not found.' });
        return;
      }
      const existing = checkResult.rows[0]!;
      if (existing.driver_id !== driverId) {
        res.status(403).json({ success: false, error: 'Not authorized to update this stop.' });
        return;
      }
      res.status(400).json({ success: false, error: 'Stop has already been actioned.' });
      return;
    }

    const stop = updateResult.rows[0]!;
    const routeId = stop.route_id;

    // 5. Attempt route completion
    const completed = await maybeCompleteRoute(routeId);

    // 6. Broadcast route_completed alert if route was just finished
    if (completed) {
      broadcastAlert({
        type: 'route_completed',
        routeId,
        driverId: driverId ?? null,
        driverName: null,
        ts: new Date().toISOString(),
      });
    }

    res.json({ success: true, routeCompleted: completed });
  } catch (err) {
    console.error('[stop-complete] Error completing stop:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});