import type { FastifyPluginAsync } from 'fastify';
import { invalidatePinCache } from '../../cache/index';


interface ConfirmPinBody {
  confirmed: boolean;
  correctedLat?: number;
  correctedLng?: number;
}


export const confirmPinRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { stopId: string }; Body: ConfirmPinBody }>(
    '/api/v1/stops/:stopId/confirm-pin',
    {
      onRequest: [(fastify as any).authenticate],
      schema: {
        params: { type: 'object', properties: { stopId: { type: 'string' } }, required: ['stopId'] },
        body: {
          type: 'object',
          properties: {
            confirmed:     { type: 'boolean' },
            correctedLat:  { type: 'number' },
            correctedLng:  { type: 'number' },
          },
          required: ['confirmed'],
        },
      },
    },
    async (request, reply) => {
      const { stopId } = request.params;
      const { confirmed, correctedLat, correctedLng } = request.body;
      const db = (fastify as any).pg; // assumes @fastify/postgres is registered


      const { rows } = await db.query(
        'SELECT address, normalised_address, pin_verify_count FROM stops WHERE id = $1 LIMIT 1',
        [stopId],
      );
      if (!rows.length) return reply.code(404).send({ error: 'Stop not found' });


      const stop = rows;
      const newCount = (stop.pin_verify_count ?? 0) + 1;
      const nowVerified = newCount >= 3;


      await db.query(
        `UPDATE stops SET
          pin_verify_count  = $1,
          pin_verified      = $2,
          pin_verified_at   = CASE WHEN $2 THEN NOW() ELSE pin_verified_at END,
          pin_corrected_lat = COALESCE($3, pin_corrected_lat),
          pin_corrected_lng = COALESCE($4, pin_corrected_lng)
         WHERE id = $5`,
        [newCount, nowVerified, correctedLat ?? null, correctedLng ?? null, stopId],
      );


      if (nowVerified && stop.normalised_address) {
        await invalidatePinCache(stop.normalised_address);
      }


      return reply.code(204).send();
    },
  );
};