/**
 * POST /api/v1/stops/:stopId/pin-correction
 *
 * Driver submits a precise door pin by:
 *   a) dragging the pin to the real entrance, or
 *   b) entering a what3words address, or
 *   c) scanning/pasting a Plus Code.
 *
 * Effect:
 *   1. Resolves the input to coordinates (W3W / Plus Code / raw drag).
 *   2. Updates door_pin_* columns on the stop (navigation will use this pin).
 *   3. Writes a record to stop_pin_corrections for the audit trail.
 *   4. Upserts geocode_pins so future drivers at the same address benefit.
 *   5. Invalidates the Redis geocoding cache for this address.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../../db/index.js';
import { upsertGeocodePin } from '../../db/pin-store.js';
import { resolveW3wToDoorPin, isW3wAddress } from '../../geocoding/w3w-client.js';
import { resolvePlusCodeToDoorPin, isPlusCode, encodePlusCode } from '../../geocoding/plus-codes-client.js';

const BodySchema = z.object({
  /** Raw drag: caller provides the final lat/lng directly. */
  lat:       z.number().optional(),
  lng:       z.number().optional(),
  /** what3words address (alternative to lat/lng) */
  w3w:       z.string().optional(),
  /** Plus Code (alternative to lat/lng) */
  plusCode:  z.string().optional(),
  /** Free-text driver note */
  note:      z.string().max(500).optional(),
});

export const pinCorrectionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { stopId: string };
    Body: z.infer<typeof BodySchema>;
  }>(
    '/api/v1/stops/:stopId/pin-correction',
    {
      preHandler: [requireAuth],
      schema: {
        params: {
          type: 'object',
          properties: { stopId: { type: 'string' } },
          required: ['stopId'],
        },
        body: {
          type: 'object',
          properties: {
            lat:      { type: 'number' },
            lng:      { type: 'number' },
            w3w:      { type: 'string' },
            plusCode: { type: 'string' },
            note:     { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = BodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ ok: false, error: body.error.message });
      }

      const { stopId } = request.params;
      const { lat, lng, w3w, plusCode, note } = body.data;

      // Resolve input to coordinates
      let resolvedLat: number | null = null;
      let resolvedLng: number | null = null;
      let source = 'driver_drag';

      if (w3w && isW3wAddress(w3w)) {
        const pin = await resolveW3wToDoorPin(w3w);
        if (!pin) {
          return reply.code(400).send({ ok: false, error: 'Could not resolve what3words address' });
        }
        resolvedLat = pin.lat;
        resolvedLng = pin.lng;
        source = 'w3w';
      } else if (plusCode && isPlusCode(plusCode)) {
        const pin = resolvePlusCodeToDoorPin(plusCode);
        if (!pin) {
          return reply.code(400).send({ ok: false, error: 'Invalid Plus Code' });
        }
        resolvedLat = pin.lat;
        resolvedLng = pin.lng;
        source = 'plus_code';
      } else if (typeof lat === 'number' && typeof lng === 'number') {
        resolvedLat = lat;
        resolvedLng = lng;
        source = 'driver_drag';
      } else {
        return reply.code(400).send({ ok: false, error: 'Provide lat+lng, w3w, or plusCode' });
      }

      const generatedPlusCode = encodePlusCode(resolvedLat, resolvedLng);

      // Verify stop exists and get normalised address
      const { rows: stopRows } = await pool.query<{
        id: string; normalised_address: string | null;
      }>(
        'SELECT id, normalised_address FROM stops WHERE id = $1 LIMIT 1',
        [stopId],
      );
      if (!stopRows[0]) {
        return reply.code(404).send({ ok: false, error: 'Stop not found' });
      }
      const stop = stopRows[0];

      const driverId = (request as any).authUser?.id ?? null;

      try {
        await pool.query(
          `UPDATE stops SET
             door_pin_lat        = $1,
             door_pin_lng        = $2,
             door_pin_source     = $3,
             door_pin_confidence = 0.90,
             door_pin_updated_at = NOW()
           WHERE id = $4`,
          [resolvedLat, resolvedLng, source, stopId],
        );

        // Audit trail
        await pool.query(
          `INSERT INTO stop_pin_corrections (stop_id, driver_id, lat, lng, source, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [stopId, driverId, resolvedLat, resolvedLng, source, note ?? null],
        );

        // Keep community geocode_pins in sync
        if (stop.normalised_address) {
          await upsertGeocodePin({
            normalisedAddress: stop.normalised_address,
            lat: resolvedLat,
            lng: resolvedLng,
            correctedLat: resolvedLat,
            correctedLng: resolvedLng,
          });

          try {
            const { invalidatePinCache } = await import('../../cache/index.js');
            await invalidatePinCache(stop.normalised_address);
          } catch {
            // non-fatal
          }
        }

        return reply.send({
          ok: true,
          data: {
            lat: resolvedLat,
            lng: resolvedLng,
            plusCode: generatedPlusCode,
            source,
          },
        });
      } catch (err) {
        request.log.error({ err }, '[pin-correction] Unexpected error');
        return reply.code(500).send({ ok: false, error: 'Internal server error' });
      }
    },
  );
};
