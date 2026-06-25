/**
 * POST /api/plan
 * ---
 * Plan a full multi-stop delivery route.
 *
 * Body:
 * {
 *   vehicleId: VehicleId,
 *   depotLat: number,
 *   depotLon: number,
 *   shiftStart: string (ISO),
 *   stops: Array<{
 *     stopId: string,
 *     address: string,
 *     what3words?: string,
 *     lat?: number, lon?: number,
 *     hardWindowStart?: string, hardWindowEnd?: string,
 *     dwellMinutes?: number,
 *     isCollection?: boolean,
 *     weightKg?: number
 *   }>
 * }
 */

import { Router, Request, Response } from 'express';
import { batchResolveStopPins } from '../../services/stop-precision';
import { annotateRouteWithTurnAlerts } from '../../services/turn-engine';
import { planRoute, StopInput } from '../../services/route-engine';
import { VehicleId } from '../../packages/vehicle-profiles';

export const planRouter = Router();

planRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      vehicleId,
      depotLat,
      depotLon,
      shiftStart,
      stops: rawStops,
      avgSpeedKmh,
    } = req.body as {
      vehicleId: VehicleId;
      depotLat: number;
      depotLon: number;
      shiftStart: string;
      stops: Array<{
        stopId: string;
        address: string;
        what3words?: string;
        lat?: number;
        lon?: number;
        hardWindowStart?: string;
        hardWindowEnd?: string;
        softWindowStart?: string;
        softWindowEnd?: string;
        dwellMinutes?: number;
        isCollection?: boolean;
        weightKg?: number;
      }>;
      avgSpeedKmh?: number;
    };

    // 1. Resolve physical pins for all stops
    const pins = await batchResolveStopPins(
      rawStops.map((s) => ({
        address: s.address,
        what3words: s.what3words,
        lat: s.lat,
        lon: s.lon,
      })),
    );

    // 2. Annotate each stop with turn feasibility alert
    const turnAlerts = await annotateRouteWithTurnAlerts(
      pins.map((pin, i) => ({
        lat: pin.lat,
        lon: pin.lon,
        stopId: rawStops[i].stopId,
      })),
      vehicleId,
    );

    const alertMap = new Map(turnAlerts.map((a) => [a.stopId, a.turnAlert]));

    // 3. Build StopInput array
    const stopInputs: StopInput[] = rawStops.map((raw, i) => ({
      stopId: raw.stopId,
      address: raw.address,
      pin: pins[i],
      hardWindowStart: raw.hardWindowStart ? new Date(raw.hardWindowStart) : undefined,
      hardWindowEnd: raw.hardWindowEnd ? new Date(raw.hardWindowEnd) : undefined,
      softWindowStart: raw.softWindowStart ? new Date(raw.softWindowStart) : undefined,
      softWindowEnd: raw.softWindowEnd ? new Date(raw.softWindowEnd) : undefined,
      dwellMinutes: raw.dwellMinutes,
      isCollection: raw.isCollection,
      weightKg: raw.weightKg,
      turnAlert: alertMap.get(raw.stopId),
    }));

    // 4. Run route optimiser
    const result = planRoute({
      stops: stopInputs,
      depotLat,
      depotLon,
      shiftStart,
      avgSpeedKmh,
    });

    res.json({ success: true, route: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});
