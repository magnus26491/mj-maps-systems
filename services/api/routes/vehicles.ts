import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { getMakes, getModelsForMake, getYearsForModel, lookupVehicle, VEHICLE_CATALOGUE }
  from '../../../packages/vehicle-catalogue/index.js';
import { pool } from '../../db/index.js';


export async function vehiclesRoutes(server: FastifyInstance): Promise<void> {


  /**
   * GET /api/v1/vehicles
   * Returns the full catalogue for driver app dropdowns.
   * Public — no auth required (no sensitive data).
   */
  server.get('/api/v1/vehicles', async (_request, reply) => {
    const makes     = getMakes();
    const catalogue = VEHICLE_CATALOGUE;
    return reply.send({
      ok: true,
      data: catalogue,   // Vehicle[] array — matches frontend lib/api.ts expectation
      makes,             // kept for any caller that reads makes separately
      catalogue,         // alias for backward compatibility
    });
  });


  /**
   * PUT /api/v1/drivers/me/vehicle
   * Driver selects their vehicle for today's shift.
   * Looks up real specs from catalogue and writes to DB.
   * Also updates vehicle_id (routing profile key) for backward compatibility.
   */
  server.put<{
    Body: { make: string; model: string; year: number };
  }>(
    '/api/v1/drivers/me/vehicle',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { make, model, year } = request.body;
      const driverId = (request as any).authUser?.id;


      if (!make || !model || !year) {
        return reply.code(400).send({ ok: false, error: 'make, model and year are required' });
      }


      const spec = lookupVehicle(make, model);
      if (!spec) {
        return reply.code(400).send({ ok: false, error: `Unknown vehicle: ${make} ${model}` });
      }


      const currentYear = new Date().getFullYear();
      if (year < spec.yearFrom || year > currentYear + 1) {
        return reply.code(400).send({
          ok: false,
          error: `Year ${year} is not valid for ${make} ${model} (${spec.yearFrom}–${spec.yearTo})`,
        });
      }


      await pool.query(
        `UPDATE drivers SET
           vehicle_id         = $1,
           vehicle_make       = $2,
           vehicle_model      = $3,
           vehicle_year       = $4,
           vehicle_height_m   = $5,
           vehicle_gvw_kg     = $6,
           vehicle_payload_kg = $7,
           vehicle_length_m   = $8,
           updated_at         = NOW()
         WHERE id = $9`,
        [
          spec.vehicleId, make, model, year,
          spec.heightM, spec.gvwKg, spec.payloadKg, spec.lengthM,
          driverId,
        ],
      );


      return reply.send({
        ok: true,
        data: {
          vehicleId:         spec.vehicleId,
          make, model, year,
          heightM:          spec.heightM,
          payloadKg:        spec.payloadKg,
          gvwKg:            spec.gvwKg,
          lengthM:          spec.lengthM,
          bridgeRestricted: spec.bridgeRestricted,
          hgv:              spec.hgv,
        },
      });
    },
  );


  /**
   * PATCH /api/v1/drivers/me/vehicle
   * Driver selects their vehicle by profile key (e.g. 'TRANSIT_LWB_GB').
   * Used by the frontend which sends {vehicleId: string} — a routing profile key.
   */
  server.patch<{
    Body: { vehicleId: string };
  }>(
    '/api/v1/drivers/me/vehicle',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { vehicleId } = request.body ?? {};
      const driverId = (request as any).authUser?.id;

      if (!vehicleId || typeof vehicleId !== 'string') {
        return reply.code(400).send({ ok: false, error: 'vehicleId is required' });
      }

      if (!driverId) {
        return reply.code(401).send({ ok: false, error: 'Not authenticated' });
      }

      await pool.query(
        `UPDATE users SET
           vehicle_id  = $1,
           updated_at  = NOW()
         WHERE id = $2`,
        [vehicleId, driverId],
      );

      return reply.send({ ok: true, vehicleId });
    },
  );
}