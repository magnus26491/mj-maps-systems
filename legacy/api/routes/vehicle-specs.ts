/**
 * GET /api/v1/vehicle-specs
 * ---
 * Returns all vehicle specifications from the vehicle_specs table.
 * Used by the driver app vehicle-select screen.
 *
 * Auth: Bearer JWT (authenticateDriver middleware)
 */
import { Router, Request, Response } from 'express';
import { authenticateDriver } from '../middleware/authenticate';
import { pool } from '../../services/db';

export const vehicleSpecsRouter = Router();

vehicleSpecsRouter.get(
  '/',
  authenticateDriver,
  async (_req: Request, res: Response) => {
    try {
      const result = await pool.query<{
        id:         string;
        make:       string;
        model:      string;
        year:       number;
        height_m:   number;
        length_m:   number;
        width_m:    number;
        gvw_kg:     number;
        payload_kg: number;
        hazmat:     boolean;
        profile_key: string;
      }>(
        `SELECT id, make, model, year, height_m, length_m, width_m,
                gvw_kg, payload_kg, hazmat, profile_key
         FROM vehicle_specs
         ORDER BY make, model`,
      );

      const data = result.rows.map(row => ({
        id:         row.id,
        make:       row.make,
        model:      row.model,
        year:       row.year,
        heightM:    row.height_m,
        lengthM:    row.length_m,
        widthM:     row.width_m,
        gvwKg:      row.gvw_kg,
        payloadKg:  row.payload_kg,
        hazmat:     row.hazmat,
        profileKey: row.profile_key,
      }));

      res.json({ ok: true, data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  },
);