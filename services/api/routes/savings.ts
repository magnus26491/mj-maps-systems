/**
 * services/api/routes/savings.ts
 *
 * Quantified Savings API — all routes require:
 *   authenticateDriver + requireEnterprise
 *
 * Endpoints:
 *   GET /api/v1/analytics/savings
 *     → driver or fleet-level savings with conservative baseline model
 *     → plan: pro (driver own data) | enterprise (fleet data)
 *
 *   GET /api/v1/analytics/savings/summary
 *     → 30-day rolling summary for HUD / dashboard cards
 *
 * Guard applied at mount point in server.ts.
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth, requireEnterprise } from '../middleware/auth.js';
import { computeSavings, computeSavingsSummary } from '../../savings/index.js';

export async function savingsRoutes(server: FastifyInstance): Promise<void> {
  const guard = { preHandler: [requireAuth, requireEnterprise] };

  // ── Date helpers ─────────────────────────────────────────────────────────────

  function parseDate(param: string | undefined, fallback: Date): Date {
    if (!param) return fallback;
    const d = new Date(param);
    return isNaN(d.getTime()) ? fallback : d;
  }

  // ── GET /api/v1/analytics/savings ─────────────────────────────────────────

  server.get('/api/v1/analytics/savings', guard, async (request, reply) => {
    const authUser = (request as unknown as { authUser?: { id: string; planId: string } }).authUser;
    const query    = request.query as Record<string, unknown>;

    const rawFrom = query.from as string | undefined;
    const rawTo   = query.to   as string | undefined;
    const rawDriverId = query.driverId as string | undefined;
    const granularity = (query.granularity as string) || 'day';

    // Validate dates
    if (rawFrom && isNaN(new Date(rawFrom).getTime())) {
      return reply.code(400).send({ ok: false, error: 'Invalid `from` date format.' });
    }
    if (rawTo && isNaN(new Date(rawTo).getTime())) {
      return reply.code(400).send({ ok: false, error: 'Invalid `to` date format.' });
    }

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const from = parseDate(rawFrom, defaultFrom);
    const to   = parseDate(rawTo, now);

    // Drivers can only view their own savings unless on Enterprise plan
    const driverId = rawDriverId?.trim();
    if (driverId && authUser?.planId !== 'enterprise') {
      return reply.code(403).send({
        ok: false, error: 'Only fleet managers can view other drivers\' savings.',
        code: 'ENTERPRISE_REQUIRED',
      });
    }
    // Default to own driverId for non-enterprise
    const effectiveDriverId = driverId ?? authUser?.id ?? undefined;

    try {
      const result = await computeSavings(from, to, effectiveDriverId);

      // Granularity is informational only — the service computes aggregated totals
      return {
        ok: true,
        granularity,
        methodology: {
          description: 'Baseline model: naive haversine routing between postcode-centroid pins + 0.4km penalty per stop for approach repositioning. Travel time at 38 km/h average. Fuel at 8.5L/100km.',
          confidenceLevels: {
            high:   '>=5 completed routes, GPS trace quality good',
            medium: '>=3 routes OR GPS coverage 70-99%',
            low:    '<3 routes OR GPS coverage <70%',
          },
        },
        ...result,
      };
    } catch (err) {
      request.log.error({ err: err as Error }, '[savings] computeSavings failed');
      return reply.code(500).send({ ok: false, error: 'Failed to compute savings.' });
    }
  });

  // ── GET /api/v1/analytics/savings/summary ──────────────────────────────────

  server.get('/api/v1/analytics/savings/summary', guard, async (request, reply) => {
    const authUser = (request as unknown as { authUser?: { id: string; planId: string } }).authUser;

    try {
      const summary = await computeSavingsSummary(authUser?.id);
      return {
        ok: true,
        periodDays: summary.periodDays,
        completedRoutes: summary.completedRoutes,
        headline: summary.completedRoutes === 0
          ? 'No completed routes yet'
          : `~${summary.totalDurationSavedMin} min saved · ${summary.totalRiskyTurnsAvoided} risky turns avoided`,
        metrics: {
          distanceSavedKm:     summary.totalDistanceSavedKm,
          durationSavedMin:    summary.totalDurationSavedMin,
          fuelSavedLitres:     summary.totalFuelSavedLitres,
          riskyTurnsAvoided:   summary.totalRiskyTurnsAvoided,
          avgDistanceSavedKm:  summary.avgDistanceSavedPerRouteKm,
          avgDurationSavedMin: summary.avgDurationSavedPerRouteMin,
        },
      };
    } catch (err) {
      request.log.error({ err: err as Error }, '[savings] computeSavingsSummary failed');
      return reply.code(500).send({ ok: false, error: 'Failed to compute savings summary.' });
    }
  });
}