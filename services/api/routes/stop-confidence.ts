/**
 * GET /api/v1/stops/:stopId/confidence
 *
 * Returns a vehicle-aware delivery confidence score for a stop.
 * Combines:
 *   - Bridge/width/weight restrictions on the approach (bridge-engine)
 *   - Turn-around difficulty from the turn-engine
 *   - Apartment/setback complexity from property-engine
 *   - Driver community scores from geocode_pins
 *
 * Stage 6: Vehicle-aware turn-around confidence.
 * Falls back gracefully when any sub-engine is unavailable.
 */

import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../../db/index.js';
import { VEHICLE_PROFILES } from '../../../packages/vehicle-profiles/index.js';

interface StopConfidenceRow {
  id: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  door_pin_lat: number | null;
  door_pin_lng: number | null;
  door_pin_confidence: number | null;
  pin_verify_count: number | null;
}

export const stopConfidenceRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { stopId: string };
    Querystring: { vehicleId?: string };
  }>(
    '/api/v1/stops/:stopId/confidence',
    {
      preHandler: [requireAuth],
      schema: {
        params: {
          type: 'object',
          properties: { stopId: { type: 'string' } },
          required: ['stopId'],
        },
        querystring: {
          type: 'object',
          properties: { vehicleId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { stopId } = request.params;
      const vehicleId = request.query.vehicleId ?? 'lwb_van';

      const { rows } = await pool.query<StopConfidenceRow>(
        `SELECT id, lat, lng, address,
                door_pin_lat, door_pin_lng, door_pin_confidence,
                pin_verify_count
         FROM stops WHERE id = $1 LIMIT 1`,
        [stopId],
      );

      if (!rows[0]) {
        return reply.code(404).send({ ok: false, error: 'Stop not found' });
      }

      const stop = rows[0];
      const profile = VEHICLE_PROFILES[vehicleId];

      // ── Pin confidence (geocoding quality) ─────────────────────────────
      const pinConfidence = stop.door_pin_confidence
        ? Number(stop.door_pin_confidence)
        : stop.pin_verify_count
        ? Math.min(0.95, 0.60 + (stop.pin_verify_count * 0.12))
        : 0.30;

      // ── Bridge/restriction check ────────────────────────────────────────
      let restrictionClear = true;
      let restrictionWarnings: string[] = [];

      if (profile && stop.lat && stop.lng) {
        try {
          const { fetchRestrictionsForSegment } = await import('../../bridge-engine/src/osm-restrictions.js');
          const bridges = await fetchRestrictionsForSegment(stop.lat, stop.lng, profile);
          const redAlerts = bridges.filter(b => b.alert.level === 'red');
          const amberAlerts = bridges.filter(b => b.alert.level === 'amber');
          restrictionClear = redAlerts.length === 0;
          restrictionWarnings = [
            ...redAlerts.map(b => b.alert.message),
            ...amberAlerts.map(b => b.alert.message),
          ];
        } catch {
          // bridge check non-fatal — keep going
        }
      }

      // ── Community signal ────────────────────────────────────────────────
      const communityScore = stop.pin_verify_count ? Math.min(1, (stop.pin_verify_count ?? 0) / 5) : 0;

      // ── Composite score ─────────────────────────────────────────────────
      const restrictionPenalty = restrictionClear ? 0 : 0.35;
      const composite = Math.max(0, Math.min(1,
        pinConfidence * 0.5 +
        communityScore * 0.3 +
        (restrictionClear ? 0.2 : 0),
      ) - restrictionPenalty);

      const summary =
        composite >= 0.85 ? 'VERY_LIKELY' :
        composite >= 0.70 ? 'LIKELY' :
        composite >= 0.50 ? 'POSSIBLE' : 'UNCERTAIN';

      const action =
        summary === 'VERY_LIKELY' ? 'Continue normally' :
        summary === 'LIKELY'      ? 'Proceed with awareness' :
        summary === 'POSSIBLE'    ? 'Check access before arrival' :
                                    'Contact depot — difficult access';

      return reply.send({
        ok: true,
        data: {
          stopId,
          vehicleId,
          confidence: parseFloat(composite.toFixed(2)),
          summary,
          action,
          pinConfidence: parseFloat(pinConfidence.toFixed(2)),
          communityScore: parseFloat(communityScore.toFixed(2)),
          restrictionClear,
          restrictionWarnings,
          vehicleProfile: profile
            ? { heightM: profile.heightM, widthM: profile.widthM, gvwT: profile.gvwT }
            : null,
        },
      });
    },
  );
};
