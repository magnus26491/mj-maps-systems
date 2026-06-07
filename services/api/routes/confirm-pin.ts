/**
 * POST /api/v1/stops/:stopId/confirm-pin
 *
 * Called by the driver app when the driver:
 *   a) confirms the pin is correct (confirmed: true, no corrected coords), OR
 *   b) drags the pin to the real entrance (confirmed: true, correctedLat/Lng set)
 *
 * Behaviour:
 * 1. Increments the stop's pin_verify_count.
 * 2. Upserts geocode_pins so future drivers at the same address get the
 *    accurate pin automatically once contributor_count reaches threshold.
 * 3. Invalidates the Redis pin cache for this address once verified.
 * 4. Returns the updated contributor count and confidence level.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireFeature } from '../middleware/auth.js';
import {
  getStopPinRow,
  updateStopPin,
  upsertGeocodePin,
} from '../../db/pin-store.js';


const BodySchema = z.object({
  confirmed:    z.boolean(),
  correctedLat: z.number().optional(),
  correctedLng: z.number().optional(),
});


export const confirmPinRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { stopId: string };
    Body: z.infer<typeof BodySchema>;
  }>(
    '/api/v1/stops/:stopId/confirm-pin',
    {
      preHandler: [requireAuth, requireFeature('PIN_CONFIRM')],
      schema: {
        params: {
          type: 'object',
          properties: { stopId: { type: 'string' } },
          required: ['stopId'],
        },
        body: {
          type: 'object',
          properties: {
            confirmed:    { type: 'boolean' },
            correctedLat: { type: 'number' },
            correctedLng: { type: 'number' },
          },
          required: ['confirmed'],
        },
      },
    },
    async (request, reply) => {
      const body = BodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ ok: false, error: body.error.message });
      }


      const { stopId } = request.params;
      const { confirmed, correctedLat, correctedLng } = body.data;


      // Only process confirmed pins (driver dismissed without confirming = no-op)
      if (!confirmed) {
        return reply.code(204).send();
      }


      try {
        // 1. Load the stop
        const stop = await getStopPinRow(stopId);
        if (!stop) {
          return reply.code(404).send({ ok: false, error: 'Stop not found' });
        }


        const newCount = (stop.pin_verify_count ?? 0) + 1;


        // 2. Update the stop record
        await updateStopPin({
          stopId,
          newCount,
          correctedLat,
          correctedLng,
        });


        // 3. Upsert geocode_pins — use stop's existing coords as fallback
        //    (stop.pin_lat/pin_lng are the current geocoded coords)
        let geocodePinResult: { contributorCount: number; confidence: number } | null = null;


        if (stop.normalised_address) {
          const baseLat = stop.pin_lat ?? 0;
          const baseLng = stop.pin_lng ?? 0;


          geocodePinResult = await upsertGeocodePin({
            normalisedAddress: stop.normalised_address,
            lat: baseLat,
            lng: baseLng,
            correctedLat,
            correctedLng,
          });


          // 4. Invalidate Redis cache once confidence threshold reached
          if (geocodePinResult.confidence >= 1) {
            try {
              const { invalidatePinCache } = await import('../../cache/index.js');
              await invalidatePinCache(stop.normalised_address);
            } catch (cacheErr) {
              // Non-fatal — cache miss on next lookup is acceptable
              request.log.warn({ cacheErr }, '[confirm-pin] Redis cache invalidation failed');
            }
          }
        }


        return reply.send({
          ok: true,
          data: {
            pinVerifyCount: newCount,
            pinVerified: newCount >= 3,
            contributorCount: geocodePinResult?.contributorCount ?? newCount,
            confidence: geocodePinResult?.confidence ?? 0,
          },
        });
      } catch (err) {
        request.log.error({ err }, '[confirm-pin] Unexpected error');
        return reply.code(500).send({ ok: false, error: 'Internal server error' });
      }
    },
  );
};
