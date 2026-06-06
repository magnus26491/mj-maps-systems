/**
 * POST /api/stop-feedback
 * -----------------------
 * Receives a driver's turn report after servicing a stop.
 * Writes to turn_reports table, which triggers the PostgreSQL community_score
 * upsert via the refresh_community_score() trigger.
 * Then invalidates the Redis community score cache for that location
 * so the next turn-engine call gets fresh data.
 *
 * Body:
 * {
 *   lat: number,
 *   lon: number,
 *   vehicleId: VehicleId,
 *   couldTurn: boolean,
 *   hadToReverse: boolean,
 *   roadWidthEst?: number,   // driver's visual estimate in metres
 *   notes?: string,
 *   driverId?: string,       // UUID
 *   stopId?: string          // UUID
 * }
 */

import { Router, Request, Response } from 'express';
import { insertTurnReport } from '../../services/db';
import { invalidateCommunityScore } from '../../services/cache';
import { VehicleId } from '../../packages/vehicle-profiles';

export const stopFeedbackRouter = Router();

stopFeedbackRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      lat,
      lon,
      vehicleId,
      couldTurn,
      hadToReverse,
      roadWidthEst,
      notes,
      driverId,
      stopId,
    } = req.body as {
      lat: number;
      lon: number;
      vehicleId: VehicleId;
      couldTurn: boolean;
      hadToReverse: boolean;
      roadWidthEst?: number;
      notes?: string;
      driverId?: string;
      stopId?: string;
    };

    if (lat === undefined || lon === undefined || !vehicleId || couldTurn === undefined) {
      res.status(400).json({
        success: false,
        error: 'lat, lon, vehicleId, and couldTurn are required.',
      });
      return;
    }

    // 1. Write report to PostgreSQL (triggers community_score upsert)
    const report = await insertTurnReport({
      driverId,
      stopId,
      lat,
      lon,
      vehicleId,
      couldTurn,
      hadToReverse: hadToReverse ?? false,
      roadWidthEst,
      notes,
    });

    // 2. Invalidate Redis community score cache for this location
    await invalidateCommunityScore(lat, lon);

    res.json({ success: true, reportId: report.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});
