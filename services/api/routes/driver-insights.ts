/**
 * services/api/routes/driver-insights.ts
 *
 * Driver Coaching Insights API — requires:
 *   authenticateDriver + requireEnterprise
 *
 * Endpoints:
 *   GET /api/v1/drivers/:driverId/insights
 *     → coaching insights for a specific driver
 *     → plan: pro (own data) | enterprise (any driver in fleet)
 *
 * Guard applied at mount point in server.ts.
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth, requireEnterprise } from '../middleware/auth.js';
import { pool } from '../../db/index.js';
import { computeDriverInsights } from '../../insights/index.js';

export async function driverInsightsRoutes(server: FastifyInstance): Promise<void> {
  const guard = { preHandler: [requireAuth, requireEnterprise] };

  // ── Date helpers ─────────────────────────────────────────────────────────────

  function parseDate(param: string | undefined, fallback: Date): Date {
    if (!param) return fallback;
    const d = new Date(param);
    return isNaN(d.getTime()) ? fallback : d;
  }

  // ── GET /api/v1/drivers/:driverId/insights ────────────────────────────────

  server.get<{ Params: { driverId: string } }>(
    '/api/v1/drivers/:driverId/insights',
    guard,
    async (request, reply) => {
      const { driverId } = request.params;
      const query = request.query as Record<string, unknown>;

      const authUser = (request as unknown as { authUser?: { id: string; planId: string } }).authUser;

      // Drivers can only view their own insights unless on Enterprise plan
      if (authUser?.planId !== 'enterprise' && driverId !== authUser?.id) {
        return reply.code(403).send({
          ok: false,
          error: 'You can only view your own coaching insights. Fleet managers: upgrade to Enterprise.',
          code: 'ENTERPRISE_REQUIRED',
        });
      }

      // Verify driver exists
      const { rows: driverRows } = await pool.query(
        `SELECT id, name, email FROM users WHERE id = $1 AND role = 'driver'`,
        [driverId],
      );
      if (!driverRows.length) {
        return reply.code(404).send({ ok: false, error: 'Driver not found.' });
      }
      const driver = driverRows[0] as { id: string; name: string; email: string };

      const rawFrom = query.from as string | undefined;
      const rawTo   = query.to   as string | undefined;

      if (rawFrom && isNaN(new Date(rawFrom).getTime())) {
        return reply.code(400).send({ ok: false, error: 'Invalid `from` date format.' });
      }
      if (rawTo && isNaN(new Date(rawTo).getTime())) {
        return reply.code(400).send({ ok: false, error: 'Invalid `to` date format.' });
      }

      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const from = parseDate(rawFrom, defaultFrom);
      const to   = parseDate(rawTo, now);

      try {
        const insights = await computeDriverInsights(driverId, from, to);

        // Build headline summary for the driver
        const headline = buildHeadline(insights.improvementTrend, insights.comparedToFleetAverage, insights.totalRoutes);

        return {
          ok: true,
          driver: {
            id:    driver.id,
            name:  driver.name ?? driver.email,
            email: driver.email,
          },
          headline,
          ...insights,
        };
      } catch (err) {
        request.log.error('[driver-insights] computeDriverInsights failed', err);
        return reply.code(500).send({ ok: false, error: 'Failed to compute driver insights.' });
      }
    },
  );

  // ── GET /api/v1/drivers/:driverId/insights/summary ─────────────────────────
  // Lightweight summary for driver app HUD — no pattern details, just the score

  server.get<{ Params: { driverId: string } }>(
    '/api/v1/drivers/:driverId/insights/summary',
    { preHandler: [requireAuth] },  // own data only, no enterprise gate needed for summary
    async (request, reply) => {
      const { driverId } = request.params;
      const authUser = (request as unknown as { authUser?: { id: string } }).authUser;

      // Only allow own summary
      if (driverId !== authUser?.id) {
        return reply.code(403).send({ ok: false, error: 'You can only view your own summary.' });
      }

      const to   = new Date();
      const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

      try {
        const insights = await computeDriverInsights(driverId, from, to);

        return {
          ok: true,
          trend: insights.improvementTrend,
          greenRate: insights.turnScoreDistribution.green,
          comparedToFleet: insights.comparedToFleetAverage,
          topPattern: insights.topPatterns[0] ?? null,
        };
      } catch (err) {
        request.log.error('[driver-insights] summary failed', err);
        return reply.code(500).send({ ok: false, error: 'Failed to compute insights summary.' });
      }
    },
  );
}

// ── Headline builder ──────────────────────────────────────────────────────────

function buildHeadline(
  trend: string,
  comparedToFleet: number,
  totalRoutes: number,
): string {
  if (totalRoutes === 0) {
    return 'Complete your first route to see coaching insights.';
  }
  if (trend === 'improving') {
    return 'Your approach is improving — keep it consistent.';
  }
  if (trend === 'declining') {
    return 'Your turn scores have dropped recently. Review the coaching tips below.';
  }
  if (comparedToFleet > 5) {
    return `You\'re outperforming the fleet average by ${comparedToFleet.toFixed(0)} percentage points.`;
  }
  if (comparedToFleet < -5) {
    return `You\'re ${Math.abs(comparedToFleet).toFixed(0)} points below the fleet average. Check the coaching tips.`;
  }
  return 'Your performance is in line with the fleet average. Review the coaching tips below.';
}