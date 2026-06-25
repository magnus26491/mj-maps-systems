/**
 * POST /api/turn-check
 * ---
 * Check turn feasibility at a single coordinate for a given vehicle.
 *
 * Body: { lat: number, lon: number, vehicleId: VehicleId, communityScore?: number }
 * Returns: TurnAlert
 */

import { Router, Request, Response } from 'express';
import { evaluateTurnFeasibility } from '../../services/turn-engine';
import { VehicleId } from '../../packages/vehicle-profiles';

export const turnCheckRouter = Router();

turnCheckRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { lat, lon, vehicleId, communityScore } = req.body as {
      lat: number;
      lon: number;
      vehicleId: VehicleId;
      communityScore?: number;
    };

    if (!lat || !lon || !vehicleId) {
      res.status(400).json({ success: false, error: 'lat, lon, and vehicleId are required.' });
      return;
    }

    const alert = await evaluateTurnFeasibility(lat, lon, vehicleId, communityScore);
    res.json({ success: true, alert });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});
