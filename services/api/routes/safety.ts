/**
 * POST /api/v1/safety/event
 * GET  /api/v1/safety/events             — dispatcher: recent events
 *
 * Stage 9: Safety UX — driver-triggered safety events (near-miss, hazard
 * spotted, vehicle damage, welfare check) that dispatch to supervisor.
 *
 * The driver app can trigger these via a one-tap SOS button or automatically
 * from the navigation guard when a critical restriction is detected.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { pool } from '../../db/index.js';

const EventBodySchema = z.object({
  type: z.enum([
    'NEAR_MISS',
    'HAZARD_SPOTTED',
    'VEHICLE_DAMAGE',
    'WELFARE_CHECK',
    'ROUTE_BLOCKED',
    'EMERGENCY',
  ]),
  lat:       z.number().optional(),
  lng:       z.number().optional(),
  note:      z.string().max(1000).optional(),
  routeId:   z.string().uuid().optional(),
  stopId:    z.string().uuid().optional(),
  severity:  z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
});

export const safetyRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * POST /api/v1/safety/event
   * Driver raises a safety event.  Fires Telegram alert for CRITICAL/HIGH.
   */
  fastify.post<{ Body: z.infer<typeof EventBodySchema> }>(
    '/api/v1/safety/event',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          properties: {
            type:     { type: 'string' },
            lat:      { type: 'number' },
            lng:      { type: 'number' },
            note:     { type: 'string' },
            routeId:  { type: 'string' },
            stopId:   { type: 'string' },
            severity: { type: 'string' },
          },
          required: ['type'],
        },
      },
    },
    async (request, reply) => {
      const parsed = EventBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });

      const driverId = (request as any).authUser?.id ?? null;
      const { type, lat, lng, note, routeId, stopId, severity } = parsed.data;

      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO safety_events
           (driver_id, type, severity, lat, lng, note, route_id, stop_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id`,
        [driverId, type, severity, lat ?? null, lng ?? null, note ?? null, routeId ?? null, stopId ?? null],
      );

      const eventId = rows[0]?.id;

      // Dispatcher alert for serious events
      if (severity === 'CRITICAL' || severity === 'HIGH' || type === 'EMERGENCY') {
        try {
          const { sendSafetyAlert } = await import('../../notifications/telegram-alerts.js');
          await sendSafetyAlert({ driverId, type, severity, note: note ?? '', lat, lng, routeId, stopId });
        } catch {
          // non-fatal — event is still stored
        }
      }

      return reply.send({ ok: true, data: { eventId } });
    },
  );

  /**
   * GET /api/v1/safety/events
   * Dispatcher: recent safety events (last 24h), most serious first.
   */
  fastify.get(
    '/api/v1/safety/events',
    { preHandler: [requireAuth, requireRole('dispatcher', 'admin')] },
    async (_request, reply) => {
      const { rows } = await pool.query(
        `SELECT se.id, se.driver_id, u.name AS driver_name,
                se.type, se.severity, se.lat, se.lng, se.note,
                se.route_id, se.stop_id, se.resolved_at, se.created_at
         FROM safety_events se
         LEFT JOIN users u ON u.id = se.driver_id
         WHERE se.created_at > NOW() - INTERVAL '24 hours'
         ORDER BY
           CASE se.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
           se.created_at DESC
         LIMIT 100`,
      );
      return reply.send({ ok: true, data: rows });
    },
  );

  /**
   * PATCH /api/v1/safety/events/:eventId/resolve
   * Dispatcher acknowledges/resolves an event.
   */
  fastify.patch<{ Params: { eventId: string } }>(
    '/api/v1/safety/events/:eventId/resolve',
    { preHandler: [requireAuth, requireRole('dispatcher', 'admin')] },
    async (request, reply) => {
      const { eventId } = request.params;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
        return reply.code(400).send({ ok: false, error: 'Invalid eventId' });
      }
      const resolverId = (request as any).authUser?.id ?? null;
      try {
        await pool.query(
          `UPDATE safety_events SET resolved_at = NOW(), resolved_by = $1 WHERE id = $2`,
          [resolverId, eventId],
        );
      } catch {
        return reply.code(500).send({ ok: false, error: 'Database error' });
      }
      return reply.send({ ok: true });
    },
  );
};
