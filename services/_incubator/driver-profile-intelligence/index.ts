/**
 * Driver Profile Intelligence Service
 * 
 * Learns individual driver preferences and behaviors.
 * Same stop → different recommendation for different drivers.
 */

import { pool } from '../../services/db/index';

export interface DriverPreferences {
  driverId: string;
  
  // Parking preferences
  parkingStyle: 'CLOSE' | 'CONVENIENT' | 'FREE';
  maxParkingWalkMeters: number;
  prefersLoadingBay: boolean;
  
  // Access preferences
  prefersFrontEntrance: boolean;
  maxAccessWalkMeters: number;
  usesIntercom: boolean;
  
  // Delivery style
  deliverySpeed: 'FAST' | 'STANDARD' | 'CAREFUL';
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // Time preferences
  prefersMorningStops: boolean;
  prefersAfternoonStops: boolean;
  peakHourAvoidance: boolean;
  
  // Vehicle
  preferredVehicleSize: 'SMALL' | 'MEDIUM' | 'LARGE';
  vehicleFamiliarity: Record<string, number>;
  
  // Success patterns
  successPatterns: string[];
  improvementAreas: string[];
  
  // Confidence
  profileConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
  sampleSize: number;
}

export interface DriverBehaviorMetrics {
  driverId: string;
  
  // Delivery metrics
  totalDeliveries: number;
  successfulDeliveries: number;
  successRate: number;
  
  // Timing metrics
  avgDeliveryTimeSeconds: number;
  avgParkingTimeSeconds: number;
  avgAccessTimeSeconds: number;
  
  // Override metrics
  recommendationOverrides: number;
  overrideRate: number;
  commonOverrideReasons: string[];
  
  // Performance
  performanceTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  peerComparison: number; // percentile
  
  // Preferences learned
  learnedPreferences: Partial<DriverPreferences>;
}

// ─── Preference Learning ─────────────────────────────────────────────────────────

/**
 * Record driver behavior after delivery.
 */
export async function recordDriverBehavior(
  driverId: string,
  behavior: {
    parkingTimeSeconds: number;
    parkingDistanceMeters: number;
    accessTimeSeconds: number;
    entranceUsed: string;
    totalDeliveryTime: number;
    recommendationOverride: boolean;
    overrideReason?: string;
    vehicleId: string;
    success: boolean;
  }
): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO driver_behavior (
        driver_id, parking_time_seconds, parking_distance_meters,
        access_time_seconds, entrance_used, total_delivery_time,
        recommendation_override, override_reason, vehicle_id,
        success, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    `, [
      driverId,
      behavior.parkingTimeSeconds,
      behavior.parkingDistanceMeters,
      behavior.accessTimeSeconds,
      behavior.entranceUsed,
      behavior.totalDeliveryTime,
      behavior.recommendationOverride,
      behavior.overrideReason,
      behavior.vehicleId,
      behavior.success,
    ]);
  } catch (err) {
    console.error('[driver-profile-intelligence] Failed to record behavior:', err);
  }
}

/**
 * Update driver preferences based on behavior patterns.
 */
export async function updateDriverPreferences(
  driverId: string
): Promise<DriverPreferences> {
  try {
    // Analyze recent behavior
    const result = await pool.query(`
      SELECT 
        AVG(parking_distance_meters) as avg_parking_dist,
        AVG(parking_time_seconds) as avg_parking_time,
        AVG(access_time_seconds) as avg_access_time,
        COUNT(*) FILTER (WHERE recommendation_override = true) as overrides,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE success = true) as successes,
        AVG(total_delivery_time) as avg_delivery_time,
        MODE(entrance_used) as preferred_entrance,
        ARRAY_AGG(DISTINCT vehicle_id) FILTER (WHERE count > 5) as frequent_vehicles
      FROM driver_behavior
      WHERE driver_id = $1
        AND recorded_at > NOW() - INTERVAL '30 days'
      GROUP BY driver_id
    `, [driverId]);
    
    const row = result.rows[0];
    if (!row) {
      return getDefaultPreferences(driverId);
    }
    
    const total = Number(row.total) || 0;
    const avgParkingDist = Number(row.avg_parking_dist) || 50;
    const avgParkingTime = Number(row.avg_parking_time) || 120;
    const overrideRate = Number(row.overrides) / Math.max(total, 1);
    const successRate = Number(row.successes) / Math.max(total, 1);
    
    // Determine preferences
    const parkingStyle: DriverPreferences['parkingStyle'] = 
      avgParkingDist < 30 ? 'CLOSE' :
      avgParkingDist < 80 ? 'CONVENIENT' : 'FREE';
    
    const deliverySpeed: DriverPreferences['deliverySpeed'] =
      avgParkingTime < 120 ? 'FAST' :
      avgParkingTime < 240 ? 'STANDARD' : 'CAREFUL';
    
    const riskTolerance: DriverPreferences['riskTolerance'] =
      overrideRate < 0.05 ? 'LOW' :
      overrideRate < 0.15 ? 'MEDIUM' : 'HIGH';
    
    // Update preferences in database
    await pool.query(`
      INSERT INTO driver_preferences (
        driver_id, parking_style, max_parking_walk_meters,
        prefers_front_entrance, max_access_walk_meters,
        delivery_speed, risk_tolerance, peak_hour_avoidance,
        profile_confidence, sample_size, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (driver_id)
      DO UPDATE SET
        parking_style = $2,
        max_parking_walk_meters = $3,
        prefers_front_entrance = $4,
        max_access_walk_meters = $5,
        delivery_speed = $6,
        risk_tolerance = $7,
        peak_hour_avoidance = $8,
        profile_confidence = $9,
        sample_size = $10,
        updated_at = NOW()
    `, [
      driverId,
      parkingStyle,
      avgParkingDist,
      row.preferred_entrance !== 'FRONT',
      100, // Default access walk
      deliverySpeed,
      riskTolerance,
      true, // Default peak hour avoidance
      total >= 20 ? 'HIGH' : total >= 5 ? 'MEDIUM' : 'LOW',
      total,
    ]);
    
    // Return current preferences
    return getDriverPreferences(driverId);
  } catch (err) {
    console.error('[driver-profile-intelligence] Failed to update preferences:', err);
    return getDefaultPreferences(driverId);
  }
}

// ─── Preference Retrieval ─────────────────────────────────────────────────────────

/**
 * Get driver preferences.
 */
export async function getDriverPreferences(
  driverId: string
): Promise<DriverPreferences> {
  try {
    const result = await pool.query(`
      SELECT * FROM driver_preferences WHERE driver_id = $1
    `, [driverId]);
    
    const row = result.rows[0];
    if (!row) {
      return getDefaultPreferences(driverId);
    }
    
    return {
      driverId,
      parkingStyle: row.parking_style,
      maxParkingWalkMeters: Number(row.max_parking_walk_meters),
      prefersLoadingBay: row.prefers_loading_bay ?? false,
      prefersFrontEntrance: row.prefers_front_entrance,
      maxAccessWalkMeters: Number(row.max_access_walk_meters),
      usesIntercom: row.uses_intercom ?? false,
      deliverySpeed: row.delivery_speed,
      riskTolerance: row.risk_tolerance,
      prefersMorningStops: row.prefers_morning_stops ?? false,
      prefersAfternoonStops: row.prefers_afternoon_stops ?? false,
      peakHourAvoidance: row.peak_hour_avoidance,
      preferredVehicleSize: row.preferred_vehicle_size ?? 'MEDIUM',
      vehicleFamiliarity: row.vehicle_familiarity ?? {},
      successPatterns: row.success_patterns ?? [],
      improvementAreas: row.improvement_areas ?? [],
      profileConfidence: row.profile_confidence,
      sampleSize: Number(row.sample_size),
    };
  } catch (err) {
    console.error('[driver-profile-intelligence] Failed to get preferences:', err);
    return getDefaultPreferences(driverId);
  }
}

/**
 * Get default preferences for new drivers.
 */
function getDefaultPreferences(driverId: string): DriverPreferences {
  return {
    driverId,
    parkingStyle: 'CONVENIENT',
    maxParkingWalkMeters: 50,
    prefersLoadingBay: false,
    prefersFrontEntrance: true,
    maxAccessWalkMeters: 100,
    usesIntercom: false,
    deliverySpeed: 'STANDARD',
    riskTolerance: 'MEDIUM',
    prefersMorningStops: false,
    prefersAfternoonStops: false,
    peakHourAvoidance: true,
    preferredVehicleSize: 'MEDIUM',
    vehicleFamiliarity: {},
    successPatterns: [],
    improvementAreas: [],
    profileConfidence: 'LOW',
    sampleSize: 0,
  };
}

// ─── Personalized Recommendations ───────────────────────────────────────────────

/**
 * Adjust recommendation based on driver preferences.
 */
export async function personalizeRecommendation(
  driverId: string,
  recommendation: {
    parkingSpot?: string;
    entrance?: string;
    arrivalTime?: string;
    alternativeParking?: string;
  }
): Promise<{
  adjustedRecommendation: typeof recommendation;
  reason: string;
}> {
  const prefs = await getDriverPreferences(driverId);
  
  const adjusted = { ...recommendation };
  let reason = '';
  
  // Adjust parking based on preference
  if (prefs.parkingStyle === 'CLOSE' && recommendation.alternativeParking) {
    // Prefer closer parking
    adjusted.parkingSpot = recommendation.parkingSpot ?? recommendation.alternativeParking;
    reason = 'Using preferred close parking';
  } else if (prefs.parkingStyle === 'FREE' && recommendation.alternativeParking) {
    // Prefer free parking
    adjusted.parkingSpot = recommendation.alternativeParking;
    reason = 'Using preferred free parking';
  }
  
  // Adjust entrance based on preference
  if (prefs.prefersFrontEntrance && recommendation.entrance === 'REAR') {
    // Driver prefers front - note but don't change
    reason = reason || 'Front entrance preferred by driver';
  }
  
  return {
    adjustedRecommendation: adjusted,
    reason,
  };
}

/**
 * Get driver behavior metrics.
 */
export async function getDriverMetrics(
  driverId: string
): Promise<DriverBehaviorMetrics> {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE success = true) as successes,
      AVG(total_delivery_time) as avg_delivery_time,
      AVG(parking_time_seconds) as avg_parking_time,
      AVG(access_time_seconds) as avg_access_time,
      COUNT(*) FILTER (WHERE recommendation_override = true) as overrides,
      ARRAY_AGG(override_reason) FILTER (WHERE override_reason IS NOT NULL) as override_reasons
    FROM driver_behavior
    WHERE driver_id = $1
      AND recorded_at > NOW() - INTERVAL '30 days'
  `, [driverId]);
  
  const row = result.rows[0] ?? {};
  const total = Number(row.total) || 0;
  const successes = Number(row.successes) || 0;
  const overrides = Number(row.overrides) || 0;
  const reasons = (row.override_reasons ?? []).filter(Boolean);
  
  return {
    driverId,
    totalDeliveries: total,
    successfulDeliveries: successes,
    successRate: total > 0 ? Math.round((successes / total) * 1000) / 10 : 0,
    avgDeliveryTimeSeconds: Math.round(Number(row.avg_delivery_time) || 0),
    avgParkingTimeSeconds: Math.round(Number(row.avg_parking_time) || 0),
    avgAccessTimeSeconds: Math.round(Number(row.avg_access_time) || 0),
    recommendationOverrides: overrides,
    overrideRate: total > 0 ? Math.round((overrides / total) * 1000) / 10 : 0,
    commonOverrideReasons: reasons.slice(0, 5),
    performanceTrend: 'STABLE',
    peerComparison: 50,
    learnedPreferences: {},
  };
}
