/**
 * Navigation Outcome Learning Service
 * 
 * Tracks what happened after MJ Maps gave navigation advice.
 * Updates intelligence based on real-world outcomes.
 */

import { pool } from '../../services/db/index';

export interface NavigationOutcome {
  // IDs
  stopId: string;
  routeId: string;
  driverId: string;
  
  // Timing
  predictedArrivalTime: Date;
  actualArrivalTime: Date;
  arrivalAccuracySeconds: number;
  
  // Parking
  predictedParkingDifficulty: 'EASY' | 'MODERATE' | 'HARD';
  actualParkingTimeSeconds: number;
  actualParkingDifficulty: 'EASY' | 'MODERATE' | 'HARD';
  
  // Access
  recommendedEntrance: string;
  actualEntranceUsed: string;
  entranceMatch: boolean;
  accessOutcome: 'SUCCESS' | 'FAILED' | 'ALTERED';
  
  // Route
  originalRouteDistance: number;
  actualRouteDistance: number;
  routeDeviation: boolean;
  
  // Driver
  driverUsedGps: boolean;
  driverOverride: boolean;
  overrideReason?: string;
  
  // Timestamps
  startedAt: Date;
  completedAt: Date;
}

export interface ParkingOutcome {
  stopId: string;
  addressNormalized: string;
  
  predictedDifficulty: 'EASY' | 'MODERATE' | 'HARD';
  predictedParkingSeconds: number;
  
  actualParkingSeconds: number;
  actualParkingDistance: number;
  actualDifficulty: 'EASY' | 'MODERATE' | 'HARD';
  
  hadToRepark: boolean;
  parkingPenaltyIssued: boolean;
  
  success: boolean;
  recordedAt: Date;
}

export interface AccessOutcome {
  stopId: string;
  addressNormalized: string;
  
  recommendedEntrance: string;
  attemptedEntrance: string;
  succeededEntrance: string;
  
  accessTimeSeconds: number;
  accessOutcome: 'SUCCESS' | 'FAILED' | 'ALTERED' | 'SKIPPED';
  
  customerPresent: boolean;
  intercomRequired: boolean;
  
  success: boolean;
  recordedAt: Date;
}

// ─── Outcome Capture ─────────────────────────────────────────────────────────────

/**
 * Record navigation outcome after delivery completion.
 */
export async function recordNavigationOutcome(outcome: NavigationOutcome): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO navigation_outcomes (
        stop_id, route_id, driver_id,
        predicted_arrival_time, actual_arrival_time, arrival_accuracy_seconds,
        predicted_parking_difficulty, actual_parking_time_seconds, actual_parking_difficulty,
        recommended_entrance, actual_entrance_used, entrance_match, access_outcome,
        original_route_distance, actual_route_distance, route_deviation,
        driver_used_gps, driver_override, override_reason,
        started_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    `, [
      outcome.stopId,
      outcome.routeId,
      outcome.driverId,
      outcome.predictedArrivalTime,
      outcome.actualArrivalTime,
      outcome.arrivalAccuracySeconds,
      outcome.predictedParkingDifficulty,
      outcome.actualParkingTimeSeconds,
      outcome.actualParkingDifficulty,
      outcome.recommendedEntrance,
      outcome.actualEntranceUsed,
      outcome.entranceMatch,
      outcome.accessOutcome,
      outcome.originalRouteDistance,
      outcome.actualRouteDistance,
      outcome.routeDeviation,
      outcome.driverUsedGps,
      outcome.driverOverride,
      outcome.overrideReason,
      outcome.startedAt,
      outcome.completedAt,
    ]);
  } catch (err) {
    console.error('[navigation-learning] Failed to record outcome:', err);
  }
}

/**
 * Record parking outcome.
 */
export async function recordParkingOutcome(outcome: ParkingOutcome): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO parking_outcomes (
        stop_id, address_normalized,
        predicted_difficulty, predicted_parking_seconds,
        actual_parking_seconds, actual_parking_distance, actual_difficulty,
        had_to_repark, parking_penalty_issued,
        success, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      outcome.stopId,
      outcome.addressNormalized,
      outcome.predictedDifficulty,
      outcome.predictedParkingSeconds,
      outcome.actualParkingSeconds,
      outcome.actualParkingDistance,
      outcome.actualDifficulty,
      outcome.hadToRepark,
      outcome.parkingPenaltyIssued,
      outcome.success,
      outcome.recordedAt,
    ]);
  } catch (err) {
    console.error('[navigation-learning] Failed to record parking outcome:', err);
  }
}

/**
 * Record access outcome.
 */
export async function recordAccessOutcome(outcome: AccessOutcome): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO access_outcomes (
        stop_id, address_normalized,
        recommended_entrance, attempted_entrance, succeeded_entrance,
        access_time_seconds, access_outcome,
        customer_present, intercom_required,
        success, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      outcome.stopId,
      outcome.addressNormalized,
      outcome.recommendedEntrance,
      outcome.attemptedEntrance,
      outcome.succeededEntrance,
      outcome.accessTimeSeconds,
      outcome.accessOutcome,
      outcome.customerPresent,
      outcome.intercomRequired,
      outcome.success,
      outcome.recordedAt,
    ]);
  } catch (err) {
    console.error('[navigation-learning] Failed to record access outcome:', err);
  }
}

// ─── Intelligence Updates ────────────────────────────────────────────────────────

/**
 * Update parking intelligence based on outcomes.
 */
export async function updateParkingIntelligence(
  addressNormalized: string,
  actualParkingSeconds: number
): Promise<void> {
  try {
    // Update parking difficulty based on actual time
    let difficulty: 'EASY' | 'MODERATE' | 'HARD' = 'MODERATE';
    if (actualParkingSeconds < 120) difficulty = 'EASY';
    else if (actualParkingSeconds > 300) difficulty = 'HARD';
    
    await pool.query(`
      UPDATE stop_intelligence
      SET 
        parking_difficulty = $2,
        parking_sample_count = parking_sample_count + 1,
        parking_avg_seconds = (
          (parking_avg_seconds * parking_sample_count + $3) / (parking_sample_count + 1)
        ),
        parking_confidence = LEAST(1.0, parking_sample_count / 50.0),
        updated_at = NOW()
      WHERE LOWER(address_normalized) = LOWER($1)
    `, [addressNormalized, difficulty, actualParkingSeconds]);
  } catch (err) {
    console.error('[navigation-learning] Failed to update parking intelligence:', err);
  }
}

/**
 * Update access intelligence based on outcomes.
 */
export async function updateAccessIntelligence(
  addressNormalized: string,
  entrance: string,
  success: boolean
): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO entrance_outcomes (address_normalized, entrance, success, count)
      VALUES ($1, $2, $3, 1)
      ON CONFLICT (address_normalized, entrance)
      DO UPDATE SET
        success_rate = (
          (entrance_outcomes.success_rate * entrance_outcomes.count + $3) / (entrance_outcomes.count + 1)
        ),
        count = entrance_outcomes.count + 1
    `, [addressNormalized, entrance, success]);
  } catch (err) {
    console.error('[navigation-learning] Failed to update access intelligence:', err);
  }
}

/**
 * Update arrival time predictions based on actual outcomes.
 */
export async function updateArrivalIntelligence(
  addressNormalized: string,
  predictedTime: Date,
  actualTime: Date
): Promise<void> {
  try {
    const hour = actualTime.getHours();
    const accuracySeconds = Math.abs(actualTime.getTime() - predictedTime.getTime()) / 1000;
    
    await pool.query(`
      INSERT INTO arrival_time_predictions (address_normalized, hour, accuracy_seconds, count)
      VALUES ($1, $2, $3, 1)
      ON CONFLICT (address_normalized, hour)
      DO UPDATE SET
        avg_accuracy = (
          (arrival_time_predictions.avg_accuracy * arrival_time_predictions.count + $3) / (arrival_time_predictions.count + 1)
        ),
        count = arrival_time_predictions.count + 1
    `, [addressNormalized, hour, accuracySeconds]);
  } catch (err) {
    console.error('[navigation-learning] Failed to update arrival intelligence:', err);
  }
}

// ─── Learning Summary ────────────────────────────────────────────────────────────

export interface LearningSummary {
  addressNormalized: string;
  totalDeliveries: number;
  parkingAccuracy: number;
  accessAccuracy: number;
  arrivalAccuracy: number;
  overallConfidence: number;
}

/**
 * Get learning summary for an address.
 */
export async function getLearningSummary(
  addressNormalized: string
): Promise<LearningSummary> {
  const result = await pool.query(`
    SELECT 
      (SELECT COUNT(*) FROM parking_outcomes WHERE address_normalized = $1) as parking_count,
      (SELECT AVG(accuracy_seconds) FROM arrival_time_predictions WHERE address_normalized = $1) as arrival_avg,
      (SELECT COUNT(*) FROM entrance_outcomes WHERE address_normalized = $1) as access_count
  `, [addressNormalized]);
  
  const row = result.rows[0] ?? {};
  const parkingCount = Number(row.parking_count) || 0;
  const accessCount = Number(row.access_count) || 0;
  const arrivalAvg = Number(row.arrival_avg) || 120;
  
  const parkingAccuracy = Math.min(1, parkingCount / 20);
  const accessAccuracy = Math.min(1, accessCount / 10);
  const arrivalAccuracy = arrivalAvg < 60 ? 0.9 : arrivalAvg < 180 ? 0.7 : 0.5;
  
  return {
    addressNormalized,
    totalDeliveries: parkingCount,
    parkingAccuracy,
    accessAccuracy,
    arrivalAccuracy,
    overallConfidence: (parkingAccuracy + accessAccuracy + arrivalAccuracy) / 3,
  };
}
