/**
 * Driver Management API
 * ----------------------
 * GET  /api/dispatcher/drivers        — list all drivers with route context
 * GET  /api/dispatcher/drivers/:id   — single driver + last 10 routes
 * PATCH /api/dispatcher/drivers/:id  — update name / email / role
 * DELETE /api/dispatcher/drivers/:id — delete (409 if active routes)
 *
 * Auth: authenticateDriver + requireRole('dispatcher') applied at mount point.
 * Do NOT re-apply middleware here.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../services/db';

export const driverManagementRouter = Router();

// ── GET /api/dispatcher/drivers ──────────────────────────────────────────────
driverManagementRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        d.id,
        d.name,
        d.email,
        d.plan       AS "planId",
        d.vehicle_id AS "vehicleId",
        d.role,
        d.is_active    AS "isActive",
        d.last_seen_at AS "lastSeenAt",
        d.created_at   AS "createdAt",
        (COUNT(r.id) FILTER (WHERE r.status = 'active'))::integer    AS "activeRoutes",
        (COUNT(r.id) FILTER (WHERE r.status = 'completed'
          AND r.finished_at >= NOW() - INTERVAL '24 hours'))::integer AS "completedToday"
      FROM drivers d
      LEFT JOIN routes r ON r.driver_id = d.id
      GROUP BY d.id
      ORDER BY d.name ASC
    `);
    res.json({ drivers: rows });
  } catch (err) {
    console.error('[driver-management]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ── GET /api/dispatcher/drivers/:driverId ───────────────────────────────────
driverManagementRouter.get('/:driverId', async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params;

    const driverResult = await pool.query(`
      SELECT id, name, email, role,
             is_active AS "isActive",
             last_seen_at AS "lastSeenAt",
             created_at AS "createdAt"
      FROM drivers WHERE id = $1
    `, [driverId]);

    if (!driverResult.rows.length) {
      res.status(404).json({ success: false, error: 'Driver not found.' });
      return;
    }

    const routesResult = await pool.query(`
      SELECT
        id            AS "routeId",
        status,
        total_stops   AS "totalStops",
        completed_stops AS "completedStops",
        failed_stops  AS "failedStops",
        shift_start   AS "shiftStart",
        finished_at   AS "finishedAt",
        on_time       AS "onTime",
        actual_distance_km AS "actualDistanceKm"
      FROM routes
      WHERE driver_id = $1
      ORDER BY shift_start DESC
      LIMIT 10
    `, [driverId]);

    res.json({ driver: driverResult.rows[0], routes: routesResult.rows });
  } catch (err) {
    console.error('[driver-management]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ── PATCH /api/dispatcher/drivers/:driverId ─────────────────────────────────
driverManagementRouter.patch('/:driverId', async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params;
    const { name, email, role } = req.body as { name?: string; email?: string; role?: string };

    const allowedFields: { name: string; value: string }[] = [];
    if (name !== undefined) allowedFields.push({ name: 'name', value: name });
    if (email !== undefined) allowedFields.push({ name: 'email', value: email });
    if (role !== undefined) allowedFields.push({ name: 'role', value: role });

    if (allowedFields.length === 0) {
      res.status(400).json({ success: false, error: 'No valid fields to update.' });
      return;
    }

    // Validate role if present
    if (role !== undefined && !['driver', 'dispatcher', 'admin'].includes(role)) {
      res.status(400).json({ success: false, error: 'role must be one of: driver, dispatcher, admin.' });
      return;
    }

    // Build dynamic SET clause from allowlist
    const setParts = allowedFields.map((f, i) => `${f.name} = $${i + 2}`);
    const values = [driverId, ...allowedFields.map(f => f.value)];

    const updateResult = await pool.query(
      `UPDATE drivers SET ${setParts.join(', ')} WHERE id = $1`,
      values,
    );

    if ((updateResult.rowCount ?? 0) === 0) {
      res.status(404).json({ success: false, error: 'Driver not found.' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[driver-management]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ── DELETE /api/dispatcher/drivers/:driverId ────────────────────────────────
driverManagementRouter.delete('/:driverId', async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params;

    // Check for active routes
    const activeResult = await pool.query(
      `SELECT (COUNT(*)::integer) AS active_count FROM routes WHERE driver_id = $1 AND status = 'active'`,
      [driverId],
    );
    const activeCount = activeResult.rows[0]?.active_count ?? 0;

    if (activeCount > 0) {
      res.status(409).json({ success: false, error: 'Cannot delete driver with active routes.' });
      return;
    }

    const deleteResult = await pool.query(`DELETE FROM drivers WHERE id = $1`, [driverId]);

    if ((deleteResult.rowCount ?? 0) === 0) {
      res.status(404).json({ success: false, error: 'Driver not found.' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    if ((err as any).code === '23503') {
      res.status(409).json({ success: false, error: 'Cannot delete driver with historical route records or other dependencies.' });
      return;
    }
    console.error('[driver-management]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});
