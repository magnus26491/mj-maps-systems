/**
 * Delivery Learning — Driver Profiles
 * 
 * Learns driver behavior patterns to improve route assignment and ETAs.
 */

import { pool } from '../../services/db/index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DriverProfile {
  driverId: string;
  
  // Routing preferences
  preferredApproachSide?: 'LEFT' | 'RIGHT' | 'ANY' | null;
  walkingToleranceMetres?: number;
  
  // Performance patterns
  avgCompletionTimePerStop?: number;
  parkingSpeedScore?: number;
  
  // Route characteristics
  prefersEarlyStops?: boolean;
  handlesHighRisk?: boolean;
  
  // Learning data
  routesCompleted?: number;
  stopsCompleted?: number;
  
  // Accuracy metrics
  etaAccuracyScore?: number;
  parkingAccuracyScore?: number;
}

export interface DriverPerformance {
  driverId: string;
  period: { start: Date; end: Date };
  
  // Activity
  routesCompleted: number;
  stopsCompleted: number;
  stopsFailed: number;
  
  // Timing
  avgStopTime: number;
  avgParkingTime: number;
  
  // Success metrics
  successRate: number;
  onTimeRate: number;
  
  // Pattern indicators
  earlyBird: boolean;      // Prefers morning routes
  eveningPro: boolean;     // Good in evening
  highRiskComfortable: boolean;
  
  // Comparison to average
  vsFleetAvg: {
    stopTimeDiff: number;
    successRateDiff: number;
  };
}

// ─── Profile Operations ────────────────────────────────────────────────────────

/**
 * Get driver profile
 */
export async function getDriverProfile(driverId: string): Promise<DriverProfile | null> {
  const result = await pool.query(`
    SELECT * FROM driver_profiles WHERE driver_id = $1
  `, [driverId]);
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0]!;
  return {
    driverId: row.driver_id,
    preferredApproachSide: row.preferred_approach_side,
    walkingToleranceMetres: row.walking_tolerance_metres,
    avgCompletionTimePerStop: row.avg_completion_time_per_stop,
    parkingSpeedScore: row.parking_speed_score,
    prefersEarlyStops: row.prefers_early_stops,
    handlesHighRisk: row.handles_high_risk,
    routesCompleted: row.routes_completed,
    stopsCompleted: row.stops_completed,
    etaAccuracyScore: row.eta_accuracy_score,
    parkingAccuracyScore: row.parking_accuracy_score,
  };
}

/**
 * Create or update driver profile from performance data
 */
export async function updateDriverProfile(
  driverId: string,
  updates: Partial<DriverProfile>
): Promise<DriverProfile> {
  // Get existing profile
  const existing = await getDriverProfile(driverId);
  
  // Get latest performance data
  const performance = await getDriverPerformance(driverId, 30);
  
  // Calculate new values
  const etaAccuracy = performance.avgStopTime < 5 ? 0.8 : 
                      performance.avgStopTime < 7 ? 0.6 : 0.4;
  const parkingAccuracy = performance.avgParkingTime < 3 ? 0.8 :
                         performance.avgParkingTime < 5 ? 0.6 : 0.4;
  
  await pool.query(`
    INSERT INTO driver_profiles (
      driver_id,
      preferred_approach_side,
      walking_tolerance_metres,
      avg_completion_time_per_stop,
      parking_speed_score,
      prefers_early_stops,
      handles_high_risk,
      routes_completed,
      stops_completed,
      eta_accuracy_score,
      parking_accuracy_score
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (driver_id) DO UPDATE SET
      preferred_approach_side = COALESCE($2, driver_profiles.preferred_approach_side),
      walking_tolerance_metres = COALESCE($3, driver_profiles.walking_tolerance_metres),
      avg_completion_time_per_stop = $4,
      parking_speed_score = $5,
      prefers_early_stops = COALESCE($6, driver_profiles.prefers_early_stops),
      handles_high_risk = COALESCE($7, driver_profiles.handles_high_risk),
      routes_completed = $8,
      stops_completed = $9,
      eta_accuracy_score = $10,
      parking_accuracy_score = $11
  `, [
    driverId,
    updates.preferredApproachSide ?? existing?.preferredApproachSide ?? null,
    updates.walkingToleranceMetres ?? existing?.walkingToleranceMetres ?? 200,
    updates.avgCompletionTimePerStop ?? performance.avgStopTime,
    updates.parkingSpeedScore ?? parkingAccuracy,
    updates.prefersEarlyStops ?? existing?.prefersEarlyStops ?? performance.earlyBird,
    updates.handlesHighRisk ?? existing?.handlesHighRisk ?? performance.highRiskComfortable,
    updates.routesCompleted ?? performance.routesCompleted,
    updates.stopsCompleted ?? performance.stopsCompleted,
    updates.etaAccuracyScore ?? etaAccuracy,
    updates.parkingAccuracyScore ?? parkingAccuracy,
  ]);
  
  return (await getDriverProfile(driverId))!;
}

/**
 * Get driver performance metrics over a period
 */
export async function getDriverPerformance(
  driverId: string,
  days: number = 30
): Promise<DriverPerformance> {
  // Get route data
  const routesResult = await pool.query(`
    SELECT 
      r.id,
      r.status,
      r.on_time,
      r.finished_at,
      r.shift_start
    FROM routes r
    WHERE r.driver_id = $1
      AND r.completed_at >= NOW() - INTERVAL '${days} days'
    ORDER BY r.shift_start DESC
  `, [driverId]);
  
  const routes = routesResult.rows;
  
  // Get stop data
  const stopsResult = await pool.query(`
    SELECT 
      s.route_id,
      s.status,
      s.arrived_at,
      s.completed_at,
      sp.actual_completion_time_minutes,
      sp.actual_parking_time_minutes
    FROM stops s
    JOIN stop_predictions sp ON sp.stop_id = s.id
    WHERE s.driver_id = $1
      AND s.completed_at >= NOW() - INTERVAL '${days} days'
  `, [driverId]);
  
  const stops = stopsResult.rows;
  
  // Calculate metrics
  const routesCompleted = routes.filter(r => r.status === 'completed').length;
  const stopsCompleted = stops.filter(s => s.status === 'delivered').length;
  const stopsFailed = stops.filter(s => s.status === 'failed').length;
  
  const completionTimes = stops
    .filter(s => s.actual_completion_time_minutes != null)
    .map(s => s.actual_completion_time_minutes!);
  const avgStopTime = completionTimes.length > 0
    ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
    : 5; // Default 5 minutes
  
  const parkingTimes = stops
    .filter(s => s.actual_parking_time_minutes != null)
    .map(s => s.actual_parking_time_minutes!);
  const avgParkingTime = parkingTimes.length > 0
    ? parkingTimes.reduce((a, b) => a + b, 0) / parkingTimes.length
    : 3; // Default 3 minutes
  
  const successRate = stopsCompleted + stopsFailed > 0
    ? stopsCompleted / (stopsCompleted + stopsFailed)
    : 1;
  
  const onTimeRoutes = routes.filter(r => r.on_time === true).length;
  const onTimeRate = routesCompleted > 0 ? onTimeRoutes / routesCompleted : 1;
  
  // Pattern detection
  const earlyRoutes = routes.filter(r => {
    if (!r.shift_start) return false;
    const hour = new Date(r.shift_start).getHours();
    return hour >= 5 && hour < 10;
  }).length;
  const earlyBird = earlyRoutes > routes.length * 0.6;
  
  const eveningRoutes = routes.filter(r => {
    if (!r.shift_start) return false;
    const hour = new Date(r.shift_start).getHours();
    return hour >= 16 && hour < 20;
  }).length;
  const eveningPro = eveningRoutes > routes.length * 0.4;
  
  const highRiskStops = stops.filter(s => {
    // This would need a join with stop_predictions or stop_memory
    // For now, approximate by completion time
    return (s.actual_completion_time_minutes ?? 0) > 10;
  }).length;
  const highRiskComfortable = highRiskStops > stopsCompleted * 0.2;
  
  // Compare to fleet average (simplified)
  const fleetAvgResult = await pool.query(`
    SELECT 
      AVG(sp.actual_completion_time_minutes) as avg_stop_time,
      COUNT(*) as total_stops
    FROM stop_predictions sp
    WHERE sp.actual_completion_time_minutes IS NOT NULL
      AND sp.predicted_at >= NOW() - INTERVAL '${days} days'
  `);
  const fleetAvg = fleetAvgResult.rows[0]?.avg_stop_time ?? 5;
  
  return {
    driverId,
    period: {
      start: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      end: new Date(),
    },
    routesCompleted,
    stopsCompleted,
    stopsFailed,
    avgStopTime: Math.round(avgStopTime * 10) / 10,
    avgParkingTime: Math.round(avgParkingTime * 10) / 10,
    successRate: Math.round(successRate * 100) / 100,
    onTimeRate: Math.round(onTimeRate * 100) / 100,
    earlyBird,
    eveningPro,
    highRiskComfortable,
    vsFleetAvg: {
      stopTimeDiff: Math.round((avgStopTime - fleetAvg) * 10) / 10,
      successRateDiff: 0, // Would need fleet average success rate
    },
  };
}

/**
 * Get route recommendation for a driver based on their profile
 */
export async function getRouteRecommendation(
  driverId: string,
  availableRoutes: Array<{ id: string; risk: 'LOW' | 'MEDIUM' | 'HIGH'; estimatedStops: number }>
): Promise<{
  recommended: string | null;
  reasons: string[];
}> {
  const profile = await getDriverProfile(driverId);
  const performance = await getDriverPerformance(driverId, 30);
  
  if (!profile && performance.routesCompleted < 5) {
    // New driver - recommend easier routes
    const easyRoutes = availableRoutes.filter(r => r.risk === 'LOW');
    return {
      recommended: easyRoutes[0]?.id ?? null,
      reasons: ['Starting with low-risk routes while you learn'],
    };
  }
  
  const reasons: string[] = [];
  let bestRoute: string | null = null;
  let bestScore = -Infinity;
  
  for (const route of availableRoutes) {
    let score = 0;
    
    // Risk preference
    if (profile?.handlesHighRisk && route.risk === 'HIGH') {
      score += 10;
      reasons.push(`You handle high-risk routes well`);
    } else if (!profile?.handlesHighRisk && route.risk === 'HIGH') {
      score -= 20;
    }
    
    // Stop count preference
    if (performance.stopsCompleted > 50 && route.estimatedStops > 30) {
      score += 5; // Experienced driver
    } else if (performance.stopsCompleted < 20 && route.estimatedStops > 20) {
      score -= 10;
    }
    
    // Early/late preference
    if (profile?.prefersEarlyStops && performance.earlyBird) {
      score += 5;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestRoute = route.id;
    }
  }
  
  return {
    recommended: bestRoute,
    reasons: reasons.slice(0, 3), // Top 3 reasons
  };
}

/**
 * Update driver preference based on observed behavior
 */
export async function learnFromBehavior(
  driverId: string,
  behavior: {
    parkedOnLeft?: boolean;
    walkedExtraDistance?: boolean;
    completedEarly?: boolean;
    preferredArrivalTime?: 'MORNING' | 'MIDDAY' | 'AFTERNOON' | 'EVENING';
  }
): Promise<void> {
  const existing = await getDriverProfile(driverId);
  
  const updates: Partial<DriverProfile> = {};
  
  if (behavior.parkedOnLeft !== undefined) {
    updates.preferredApproachSide = behavior.parkedOnLeft ? 'LEFT' : 'RIGHT';
  }
  
  if (behavior.walkedExtraDistance !== undefined) {
    // If they walked extra, maybe increase tolerance
    // If they didn't, keep current tolerance
    updates.walkingToleranceMetres = existing?.walkingToleranceMetres ?? 200;
  }
  
  if (behavior.preferredArrivalTime !== undefined) {
    updates.prefersEarlyStops = behavior.preferredArrivalTime === 'MORNING';
  }
  
  await updateDriverProfile(driverId, updates);
}
