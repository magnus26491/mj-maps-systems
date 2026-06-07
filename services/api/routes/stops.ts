import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { requireFeature } from '../middleware/auth.js';
import { getAccessBrief, updateAccessNotes } from '../../db/failed-store.js';


export async function stopsRoutes(server: FastifyInstance): Promise<void> {


  /**
   * PATCH /api/v1/stops/:stopId/notes
   * Dispatcher sets access notes and last-50m brief for a stop.
   * Custom plan only.
   */
  server.patch<{
    Params: { stopId: string };
    Body: { accessNotes?: string | null; last50m?: string | null };
  }>(
    '/api/v1/stops/:stopId/notes',
    { preHandler: [requireAuth, requireFeature('ACCESS_NOTES')] },
    async (request, reply) => {
      const { stopId } = request.params;
      const { accessNotes = null, last50m = null } = request.body;
      const updated = await updateAccessNotes({ stopId, accessNotes, last50m });
      if (!updated) return reply.code(404).send({ ok: false, error: 'Stop not found' });
      return reply.send({ ok: true });
    },
  );


  /**
   * GET /api/v1/stops/:stopId/approach
   * Driver app calls this at 50m (REST fallback).
   * WebSocket push is the primary path — see driver-api.ts.
   * Custom plan only.
   */
  server.get<{ Params: { stopId: string } }>(
    '/api/v1/stops/:stopId/approach',
    { preHandler: [requireAuth, requireFeature('ACCESS_NOTES')] },
    async (request, reply) => {
      const { stopId } = request.params;
      const brief = await getAccessBrief(stopId);
      if (!brief) return reply.code(404).send({ ok: false, error: 'Stop not found' });
      return reply.send({ ok: true, data: brief });
    },
  );
}