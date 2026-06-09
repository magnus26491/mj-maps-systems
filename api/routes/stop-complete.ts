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

    // 2. Load stop + verify ownership + idempotency
    const stopResult = await pool.query<{ id: string; route_id: string; driver_id: string; status: string }>(
      `SELECT id, route_id, driver_id, status FROM stops WHERE id = $1 LIMIT 1`,
      [stopId],
    );

    if (!stopResult.rows.length) {
      res.status(404).json({ success: false, error: 'Stop not found.' });
      return;
    }

    const stop = stopResult.rows[0]!;

    if (stop.driver_id !== driverId) {
      res.status(403).json({ success: false, error: 'Not authorized to update this stop.' });
      return;
    }

    if (stop.status !== 'pending') {
      res.status(400).json({ success: false, error: 'Stop has already been actioned.' });
      return;
    }

    // 3. Update stop status
    await pool.query(
      `UPDATE stops SET status = $1 WHERE id = $2`,
      [status, stopId],
    );

    // 4. Update route completed/failed counts
    const routeId = stop.route_id;
    await pool.query(`
      UPDATE routes r SET
        completed_stops = (SELECT COUNT(*) FROM stops WHERE route_id = r.id AND status = 'delivered'),
        failed_stops    = (SELECT COUNT(*) FROM stops WHERE route_id = r.id AND status = 'failed')
      WHERE r.id = $1
    `, [routeId]);

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
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});