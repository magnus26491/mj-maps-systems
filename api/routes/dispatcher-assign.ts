/**
 * Dispatcher assignment routes
 * ----------------------------
 * POST /api/dispatcher/assign  — assign a route to a driver (enterprise only)
 * GET  /api/dispatcher/drivers — list pro/enterprise drivers (enterprise only)
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../services/db';
import { broadcastAlert } from './dispatcher';
import { requireEnterprise } from '../middleware/requireEnterprise';

export const dispatcherAssignRouter = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(s: string): boolean {
  return UUID_REGEX.test(s);
}

// ── POST /api/dispatcher/assign ─────────────────────────────────────────────────
dispatcherAssignRouter.post('/assign', requireEnterprise, async (req: Request, res: Response) => {
  try {
    const { routeId, driverId, note } = req.body as {
      routeId?: string;
      driverId?: string;
      note?: string;
    };

    // Validate routeId
    if (!routeId || !isValidUuid(routeId)) {
      res.status(400).json({ success: false, error: 'Invalid routeId format.' });
      return;
    }

    // Validate driverId
    if (!driverId || !isValidUuid(driverId)) {
      res.status(400).json({ success: false, error: 'Invalid driverId format.' });
      return;
    }

    // Check route exists and status = 'active'
    const routeCheck = await pool.query(
      `SELECT id, status FROM routes WHERE id = $1`,
      [routeId],
    );
    if (routeCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Route not found.' });
      return;
    }
    if (routeCheck.rows[0].status !== 'active') {
      res.status(404).json({ success: false, error: 'Route is not active.' });
      return;
    }

    // Check driver exists
    const driverCheck = await pool.query(
      `SELECT id, name FROM drivers WHERE id = $1 AND active = TRUE`,
      [driverId],
    );
    if (driverCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Driver not found or inactive.' });
      return;
    }

    // Insert assignment
    const assignedBy = req.driver?.id ?? null;
    const { rows } = await pool.query(
      `INSERT INTO route_assignments (route_id, driver_id, assigned_by, note)
       VALUES ($1, $2, $3, $4)
       RETURNING id, route_id AS "routeId", driver_id AS "driverId", assigned_at AS "assignedAt"`,
      [routeId, driverId, assignedBy, note ?? null],
    );

    const assignment = rows[0];

    // Broadcast live alert to SSE clients
    broadcastAlert({
      type: 'assignment',
      routeId,
      driverId,
      driverName: driverCheck.rows[0].name,
      assignedAt: assignment.assignedAt,
    });

    res.status(201).json(assignment);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/dispatcher/drivers ─────────────────────────────────────────────────
dispatcherAssignRouter.get('/drivers', requireEnterprise, async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, email, plan AS "planId", vehicle_id AS "vehicleId"
      FROM drivers
      WHERE plan IN ('pro', 'enterprise') AND active = TRUE
      ORDER BY name ASC
    `);
    res.json({ drivers: rows });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});