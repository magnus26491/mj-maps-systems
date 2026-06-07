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
    return reply.send({
      ok: true,
      data: {
        makes: getMakes(),
        catalogue: VEHICLE_CATALOGUE,
      },
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
      const driverId = (request as any).authUser?.sub;


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
}