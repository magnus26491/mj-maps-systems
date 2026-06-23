/**
 * POST /api/replan
 * ---
 * Mid-route replanning. Call when a stop fails or traffic disrupts the route.
 *
 * Body: {
 *   vehicleId: VehicleId,
 *   currentLat: number,
 *   currentLon: number,
 *   currentTime: string (ISO),
 *   depotLat: number,
 *   depotLon: number,
 *   remainingStops: StopInput[]
 * }
 */

import { Router, Request, Response } from 'express';
import { replanFromPosition, StopInput } from '../../services/route-engine';
import { VehicleId } from '../../packages/vehicle-profiles';

export const replanRouter = Router();

replanRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      currentLat,
      currentLon,
      currentTime,
      depotLat,
      depotLon,
      remainingStops,
      avgSpeedKmh,
    } = req.body as {
      vehicleId: VehicleId;
      currentLat: number;
      currentLon: number;
      currentTime: string;
      depotLat: number;
      depotLon: number;
      remainingStops: StopInput[];
      avgSpeedKmh?: number;
    };

    const result = replanFromPosition(
      remainingStops,
      currentLat,
      currentLon,
      new Date(currentTime),
      avgSpeedKmh ?? 30,
      depotLat,
      depotLon,
    );

    res.json({ success: true, route: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});
