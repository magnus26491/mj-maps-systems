/**
 * services/api/routes/turn-breakdown.ts
 *
 * Route-level turn analysis for completed routes.
 * GET /api/v1/routes/:routeId/turn-breakdown
 *
 * Returns per-stop turn scores + aggregate distribution for a completed route.
 * Accessible to: route owner (driver), dispatcher, admin.
 */
import type { FastifyInstance } from 'fastify';
import { requireAuth, requireTier } from '../middleware/auth.js';

export async function turnBreakdownRoutes(server: FastifyInstance): Promise<void> {
  server.get<{ Params: { routeId: string } }>(
    '/api/v1/routes/:routeId/turn-breakdown',
    { preHandler: [requireAuth, requireTier('courier', 'fleet', 'enterprise')] },
    async (request, reply) => {
      const { routeId } = request.params;
      const authUser = (request as unknown as { authUser?: { id: string; role: string } }).authUser;

      const { pool } = await import('../../db/index.js');

      // Load route — verify ownership
      const { rows: routeRows } = await pool.query<{
        id: string; driver_id: string; status: string;
        total_stops: number; completed_stops: number; failed_stops: number;
        total_distance_km: number; actual_distance_km: number | null;
        shift_start: Date | null; finished_at: Date | null;
      }>(
        `SELECT id, driver_id, status, total_stops, completed_stops, failed_stops,
                total_distance_km, actual_distance_km, shift_start, finished_at
         FROM routes WHERE id = $1`,
        [routeId],
      );

      if (!routeRows.length) {
        return reply.code(404).send({ ok: false, error: 'Route not found.' });
      }
      const route = routeRows[0];

      // Access control: driver can only see own route
      if (authUser?.role === 'driver' && route.driver_id !== authUser.id) {
        return reply.code(403).send({ ok: false, error: 'Access denied.' });
      }

      // Load stops with turn data
      const { rows: stopRows } = await pool.query<{
        id: string; sequence_number: number;
        address: string | null; lat: number | null; lng: number | null;
        status: string; turn_score: number | null; turn_alert_level: string | null;
        completed_at: Date | null;
      }>(
        `SELECT id, sequence_number, COALESCE(address, '') AS address,
                lat, lng, status, turn_score, turn_alert_level, completed_at
         FROM stops
         WHERE route_id = $1
         ORDER BY sequence_number ASC`,
        [routeId],
      );

      const totalTurns = stopRows.filter(s => s.turn_score != null).length;
      const green = stopRows.filter(s => s.turn_alert_level === 'GREEN').length;
      const amber = stopRows.filter(s => s.turn_alert_level === 'AMBER').length;
      const red   = stopRows.filter(s => s.turn_alert_level === 'RED').length;
      const decided = green + amber + red || 1;

      return {
        ok: true,
        route: {
          id: route.id,
          status: route.status,
          totalStops: route.total_stops,
          completedStops: route.completed_stops,
          failedStops: route.failed_stops,
          totalDistanceKm: route.total_distance_km,
          actualDistanceKm: route.actual_distance_km,
          shiftStart: route.shift_start ? new Date(route.shift_start).toISOString() : null,
          finishedAt: route.finished_at ? new Date(route.finished_at).toISOString() : null,
        },
        distribution: {
          total: totalTurns,
          green, amber, red,
          greenRate:   Math.round((green / decided) * 1000) / 10,
          amberRate:   Math.round((amber / decided) * 1000) / 10,
          redRate:     Math.round((red / decided) * 1000) / 10,
        },
        stops: stopRows.map(s => ({
          id:              s.id,
          sequenceNumber:  s.sequence_number,
          address:         s.address,
          lat:             s.lat,
          lng:             s.lng,
          status:         s.status,
          turnScore:       s.turn_score,
          turnAlertLevel:  s.turn_alert_level,
          completedAt:     s.completed_at ? new Date(s.completed_at).toISOString() : null,
        })),
      };
    },
  );
}
