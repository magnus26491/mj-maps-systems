/**
 * POST /api/v1/optimise
 * ---
 * Wraps buildPlannedRoute() with a Fastify-compatible Express handler.
 * Protected by authenticateDriver middleware.
 *
 * Body:
 * {
 *   depot: { lat: number; lng: number };
 *   stops: Array<{
 *     id:             string;
 *     address:        string;
 *     lat:            number;
 *     lng:            number;
 *     parcelCount?:   number;
 *     totalWeightKg?: number;
 *     notes?:         string;
 *   }>;
 *   vehicleProfileKey:      string;
 *   plannedDepartureTime?:  string; // ISO-8601
 * }
 */

import { Router, Request, Response } from 'express';
import { buildPlannedRoute } from '../build-planned-route';
import { type OptimizerStop } from '../../services/route-optimizer/index';
import type { PlannedRouteResponse } from '../build-planned-route';

export const optimiseRouter = Router();

optimiseRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      depot?: { lat: number; lng: number };
      stops?: Array<{
        id: string;
        address: string;
        lat: number;
        lng: number;
        parcelCount?: number;
        totalWeightKg?: number;
        notes?: string;
      }>;
      vehicleProfileKey?: string;
      plannedDepartureTime?: string;
    };

    // Validate stops
    if (!Array.isArray(body.stops) || body.stops.length < 1) {
      return res.status(400).json({ error: 'stops must be a non-empty array' });
    }

    // Validate depot
    if (!body.depot || !Number.isFinite(body.depot.lat) || !Number.isFinite(body.depot.lng)) {
      return res.status(400).json({ error: 'depot must have finite lat and lng' });
    }

    // Map stops to OptimizerStop[], applying defaults
    const mappedStops: OptimizerStop[] = body.stops.map(stop => ({
      id:           stop.id,
      address:      stop.address,
      lat:          stop.lat,
      lng:          stop.lng,
      parcelCount:  stop.parcelCount ?? 1,
      totalWeightKg: stop.totalWeightKg ?? 1,
    }));

    const result: PlannedRouteResponse = await buildPlannedRoute({
      depot:                body.depot,
      stops:                mappedStops,
      vehicleProfileKey:    (body.vehicleProfileKey ?? 'TRANSIT_LWB_GB') as any,
      geoapifyApiKey:       process.env.GEOAPIFY_API_KEY,
      plannedDepartureTime: body.plannedDepartureTime,
    });

    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});