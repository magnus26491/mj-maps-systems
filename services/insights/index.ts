/**
 * services/insights/index.ts
 * Driver Coaching Insights — pattern detection from turn-score history.
 */
import { pool } from '../db/index.js';

export type PatternType =
  | 'frequent_red' | 'amber_on_narrow' | 'late_shift_risk'
  | 'consecutive_failures' | 'high_amber_trend'
  | 'improving_well' | 'stable_performer' | 'first_time_driver';
export type Severity = 'low' | 'medium' | 'high';
export type Trend = 'improving' | 'stable' | 'declining';

export interface TopPattern {
  type: PatternType; description: string; count: number;
  recommendation: string; severity: Severity;
}

export interface InsightsResult {
  period: { from: string; to: string };
  totalRoutes: number; totalStops: number; completedStops: number; failedStops: number;
  turnScoreDistribution: { green: number; amber: number; red: number; unknown: number };
  topPatterns: TopPattern[];
  improvementTrend: Trend;
  comparedToFleetAverage: number;
  fleetAverageGreenRate: number;
  routeSummaries: Array<{
    routeId: string; date: string; stops: number; completed: number; failed: number;
    redTurns: number; amberTurns: number; greenTurns: number; greenRate: number;
  }>;
}

const ROUTES_FOR_TREND = 4;
const AMBER_THRESHOLD_HIGH = 0.30;
const RED_THRESHOLD_HIGH = 1.5;
const IMPROVEMENT_DELTA = 5;

function avgGreenRateCalc(routes: Array<{ red_count: number; amber_count: number; green_count: number }>): number {
  if (!routes.length) return 0;
  let decided = 0; let green = 0;
  for (const r of routes) {
    decided += (r.red_count ?? 0) + (r.amber_count ?? 0) + (r.green_count ?? 0);
    green   += r.green_count ?? 0;
  }
  return decided > 0 ? (green / decided) * 100 : 0;
}

function computeTrend(routes: Array<{ red_count: number; amber_count: number; green_count: number }>): Trend {
  if (routes.length < ROUTES_FOR_TREND) return 'stable';
  const half   = Math.floor(routes.length / 2);
  const recent = routes.slice(0, half);
  const older  = routes.slice(half);
  const delta  = avgGreenRateCalc(recent) - avgGreenRateCalc(older);
  if (delta > IMPROVEMENT_DELTA) return 'improving';
  if (delta < -IMPROVEMENT_DELTA) return 'declining';
  return 'stable';
}

function detectPatterns(
  routes: Array<{
    route_id: string; finished_at: Date | null; shift_start: Date | null;
    failed_stops: number; completed_stops: number;
    red_count: number; amber_count: number; green_count: number;
  }>,
  ctx: {
    totalRoutes: number; avgRedPerRoute: number; avgAmberPerRoute: number;
    failedRate: number; amberRate: number; greenRate: number; improvementTrend: Trend;
  },
): TopPattern[] {
  const patterns: TopPattern[] = [];

  if (ctx.avgRedPerRoute > RED_THRESHOLD_HIGH) {
    patterns.push({
      type: 'frequent_red',
      description: `${ctx.avgRedPerRoute.toFixed(1)} RED turns per route on average — above the recommended threshold.`,
      count: Math.round(ctx.avgRedPerRoute * ctx.totalRoutes),
      recommendation: 'Review the specific locations triggering RED turns. Consider approaching from the opposite direction or using a different vehicle profile.',
      severity: 'high',
    });
  }
  if (ctx.amberRate > AMBER_THRESHOLD_HIGH * 100 && ctx.avgRedPerRoute <= RED_THRESHOLD_HIGH) {
    patterns.push({
      type: 'high_amber_trend',
      description: `${ctx.amberRate.toFixed(0)}% of your turns scored AMBER — consistent hesitation at approach points.`,
      count: Math.round((ctx.amberRate / 100) * ctx.totalRoutes * ctx.avgAmberPerRoute),
      recommendation: 'On narrow roads, slow to under 15 mph and swing wide before turning. Focus on approach speed and lane positioning.',
      severity: 'medium',
    });
  }
  const lateRoutes = routes.filter(r => {
    if (!r.shift_start) return false;
    return new Date(r.shift_start).getHours() >= 15;
  });
  if (lateRoutes.length >= 2) {
    let lateRedNum = 0; let lateDecided = 0;
    for (const r of lateRoutes) {
      const d = (r.red_count ?? 0) + (r.amber_count ?? 0) + (r.green_count ?? 0);
      lateDecided += d; lateRedNum += r.red_count ?? 0;
    }
    const lateRedRate = lateDecided > 0 ? (lateRedNum / lateDecided) * 100 : 0;
    if (lateRedRate > 15) {
      patterns.push({
        type: 'late_shift_risk',
        description: `Your RED rate is ${lateRedRate.toFixed(0)}% on late shifts — fatigue and reduced visibility may be a factor.`,
        count: lateRoutes.length,
        recommendation: 'Prioritise lower-risk routes on shifts finishing after 18:00. Residential areas in daylight where possible.',
        severity: 'medium',
      });
    }
  }
  if (ctx.failedRate > 20) {
    patterns.push({
      type: 'consecutive_failures',
      description: `${ctx.failedRate.toFixed(0)}% of your stops were failed deliveries — above the fleet average.`,
      count: Math.round((ctx.failedRate / 100) * ctx.totalRoutes),
      recommendation: 'Review failed-stop notes. Use Plus Codes to confirm gate locations before departure. Common causes: wrong address, no one home, access issues.',
      severity: 'high',
    });
  }
  if (ctx.improvementTrend === 'improving') {
    patterns.push({
      type: 'improving_well',
      description: `Your GREEN turn rate has improved over recent routes.`,
      count: ctx.totalRoutes,
      recommendation: 'Keep it up — the approach technique improvements are clearly working. Focus on consistency across all route types.',
      severity: 'low',
    });
  }
  if (patterns.length === 0 && ctx.totalRoutes >= 3) {
    patterns.push({
      type: 'stable_performer',
      description: `Consistent performance across ${ctx.totalRoutes} routes — ${ctx.greenRate.toFixed(0)}% GREEN turns with minimal RED alerts.`,
      count: ctx.totalRoutes,
      recommendation: 'Maintain your current approach. Focus on marginal improvements: route timing and minor positioning adjustments.',
      severity: 'low',
    });
  }
  if (ctx.totalRoutes < 3) {
    patterns.push({
      type: 'first_time_driver',
      description: `Only ${ctx.totalRoutes} completed route${ctx.totalRoutes === 1 ? '' : 's'} in this period.`,
      count: ctx.totalRoutes,
      recommendation: 'Complete 5+ routes to build a meaningful performance baseline. Focus on approach speed, lane positioning, and confirming gate locations.',
      severity: 'low',
    });
  }
  const SEV: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  patterns.sort((a, b) => SEV[a.severity] - SEV[b.severity]);
  return patterns.slice(0, 4);
}

export async function computeDriverInsights(
  driverId: string,
  from: Date,
  to: Date,
): Promise<InsightsResult> {
  const routeRows = await pool.query<{
    route_id: string; finished_at: Date | null; shift_start: Date | null;
    total_stops: number; completed_stops: number; failed_stops: number;
    red_count: number; amber_count: number; green_count: number;
  }>(
    `SELECT r.id AS route_id, r.finished_at, r.shift_start,
       COUNT(s.id)::int AS total_stops,
       COUNT(s.id) FILTER (WHERE s.status = 'completed') AS completed_stops,
       COUNT(s.id) FILTER (WHERE s.status = 'failed') AS failed_stops,
       COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'RED') AS red_count,
       COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'AMBER') AS amber_count,
       COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'GREEN') AS green_count
     FROM routes r
     LEFT JOIN stops s ON s.route_id = r.id
     WHERE r.driver_id = $1 AND r.status = 'completed'
       AND r.finished_at BETWEEN $2 AND $3
     GROUP BY r.id
     ORDER BY r.finished_at DESC`,
    [driverId, from.toISOString(), to.toISOString()],
  );

  const routes = routeRows.rows;
  if (!routes.length) {
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totalRoutes: 0, totalStops: 0, completedStops: 0, failedStops: 0,
      turnScoreDistribution: { green: 0, amber: 0, red: 0, unknown: 0 },
      topPatterns: [], improvementTrend: 'stable',
      comparedToFleetAverage: 0, fleetAverageGreenRate: 0, routeSummaries: [],
    };
  }

  const totalRoutes    = routes.length;
  const totalStops     = routes.reduce((s, r) => s + (r.total_stops ?? 0), 0);
  const completedStops = routes.reduce((s, r) => s + (r.completed_stops ?? 0), 0);
  const failedStops    = routes.reduce((s, r) => s + (r.failed_stops ?? 0), 0);
  const totalRed       = routes.reduce((s, r) => s + (r.red_count ?? 0), 0);
  const totalAmber     = routes.reduce((s, r) => s + (r.amber_count ?? 0), 0);
  const totalGreen     = routes.reduce((s, r) => s + (r.green_count ?? 0), 0);
  const totalDecided   = totalRed + totalAmber + totalGreen;
  const greenRate   = totalDecided > 0 ? (totalGreen / totalDecided) * 100 : 0;
  const amberRate   = totalDecided > 0 ? (totalAmber / totalDecided) * 100 : 0;
  const redRate     = totalDecided > 0 ? (totalRed / totalDecided) * 100 : 0;
  const unknownRate = totalStops > totalDecided ? ((totalStops - totalDecided) / totalStops) * 100 : 0;
  const avgRedPerRoute   = totalRoutes > 0 ? totalRed / totalRoutes : 0;
  const avgAmberPerRoute = totalRoutes > 0 ? totalAmber / totalRoutes : 0;
  const failedRate = totalStops > 0 ? (failedStops / totalStops) * 100 : 0;

  const fleetRows = await pool.query<{ avg_green_rate: number }>(
    `SELECT COALESCE(AVG(CASE WHEN (sr + sa + sg) > 0 THEN sg::numeric / (sr + sa + sg) * 100 ELSE 0 END), 0) AS avg_green_rate
     FROM (SELECT r.driver_id,
           COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'RED') AS sr,
           COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'AMBER') AS sa,
           COUNT(s.id) FILTER (WHERE s.turn_alert_level = 'GREEN') AS sg
     FROM routes r LEFT JOIN stops s ON s.route_id = r.id
     WHERE r.status = 'completed' AND r.finished_at BETWEEN $1 AND $2
     GROUP BY r.driver_id) sub`,
    [from.toISOString(), to.toISOString()],
  );
  const fleetAvgGreenRate = parseFloat(String(fleetRows.rows[0]?.avg_green_rate ?? '0')) || 0;
  const comparedToFleet   = Math.round((greenRate - fleetAvgGreenRate) * 10) / 10;
  const improvementTrend  = computeTrend(routes);
  const topPatterns = detectPatterns(routes, {
    totalRoutes, avgRedPerRoute, avgAmberPerRoute,
    failedRate, amberRate, greenRate, improvementTrend,
  });

  const routeSummaries = routes.map(r => {
    const decided = (r.red_count ?? 0) + (r.amber_count ?? 0) + (r.green_count ?? 0);
    const gr = decided > 0 ? ((r.green_count ?? 0) / decided) * 100 : 0;
    return {
      routeId: r.route_id, date: r.finished_at ? new Date(r.finished_at).toISOString() : '',
      stops: r.total_stops ?? 0, completed: r.completed_stops ?? 0, failed: r.failed_stops ?? 0,
      redTurns: r.red_count ?? 0, amberTurns: r.amber_count ?? 0, greenTurns: r.green_count ?? 0,
      greenRate: Math.round(gr * 10) / 10,
    };
  });

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totalRoutes, totalStops, completedStops, failedStops,
    turnScoreDistribution: {
      green:   Math.round(greenRate * 10) / 10,
      amber:   Math.round(amberRate * 10) / 10,
      red:     Math.round(redRate * 10) / 10,
      unknown: Math.round(unknownRate * 10) / 10,
    },
    topPatterns, improvementTrend,
    comparedToFleetAverage: Math.round(comparedToFleet * 10) / 10,
    fleetAverageGreenRate:  Math.round(fleetAvgGreenRate * 10) / 10,
    routeSummaries,
  };
}