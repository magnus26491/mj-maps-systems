/**
 * Delivery Learning — Outcome Capture
 * 
 * Records predictions and actuals for completed stops.
 * Enables the learning loop: Prediction → Delivery → Outcome → Learning
 */

import { pool } from '../../services/db/index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StopPrediction {
  stopId: string;
  routeId: string;
  driverId?: string;
  // Geocoding predictions
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  lat?: number;
  lng?: number;
  // Time predictions
  etaMinutes?: number;
  completionTimeMinutes?: number;
  // Risk predictions
  parkingDifficulty?: 'EASY' | 'MODERATE' | 'HARD';
  accessDifficulty?: 'EASY' | 'MODERATE' | 'HARD';
  completionProbability?: number;
}

export interface StopOutcome {
  stopId: string;
  routeId: string;
  // Actual outcomes
  completionTimeMinutes?: number;
  parkingTimeMinutes?: number;
  walkingDistanceMetres?: number;
  success?: boolean;
  failureReason?: string;
  driverOverride?: boolean;
}

export interface PredictionWithOutcome {
  prediction: StopPrediction;
  outcome: StopOutcome;
  correct: {
    confidence: boolean;
    parking: boolean;
    access: boolean;
    eta: boolean;
  };
  errors: {
    confidenceDelta?: number;
    etaErrorMinutes?: number;
  };
}

// ─── Prediction Storage ───────────────────────────────────────────────────────

/**
 * Store predictions for a stop before delivery
 */
export async function storePrediction(prediction: StopPrediction): Promise<string> {
  const result = await pool.query(`
    INSERT INTO stop_predictions (
      stop_id, route_id, driver_id,
      predicted_confidence, predicted_lat, predicted_lng,
      predicted_eta_minutes, predicted_completion_time_minutes,
      predicted_parking_difficulty, predicted_access_difficulty, predicted_completion_probability
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id
  `, [
    prediction.stopId,
    prediction.routeId,
    prediction.driverId ?? null,
    prediction.confidence ?? null,
    prediction.lat ?? null,
    prediction.lng ?? null,
    prediction.etaMinutes ?? null,
    prediction.completionTimeMinutes ?? null,
    prediction.parkingDifficulty ?? null,
    prediction.accessDifficulty ?? null,
    prediction.completionProbability ?? null,
  ]);
  
  return result.rows[0]!.id;
}

/**
 * Store predictions for multiple stops (batch)
 */
export async function storePredictionBatch(predictions: StopPrediction[]): Promise<string[]> {
  const ids: string[] = [];
  
  for (const prediction of predictions) {
    const id = await storePrediction(prediction);
    ids.push(id);
  }
  
  return ids;
}

// ─── Outcome Capture ─────────────────────────────────────────────────────────

/**
 * Record the actual outcome for a completed stop
 */
export async function recordOutcome(outcome: StopOutcome): Promise<void> {
  await pool.query(`
    UPDATE stop_predictions
    SET 
      actual_completion_time_minutes = COALESCE($2, actual_completion_time_minutes),
      actual_parking_time_minutes = COALESCE($3, actual_parking_time_minutes),
      actual_walking_distance_m = COALESCE($4, actual_walking_distance_m),
      actual_success = $5,
      failure_reason = $6,
      driver_override = COALESCE($7, driver_override),
      updated_at = NOW()
    WHERE stop_id = $1
    AND route_id = $8
    ORDER BY predicted_at DESC
    LIMIT 1
  `, [
    outcome.stopId,
    outcome.completionTimeMinutes ?? null,
    outcome.parkingTimeMinutes ?? null,
    outcome.walkingDistanceMetres ?? null,
    outcome.success ?? true,
    outcome.failureReason ?? null,
    outcome.driverOverride ?? false,
    outcome.routeId,
  ]);
}

/**
 * Get predictions with outcomes for a route
 */
export async function getRoutePredictionsWithOutcomes(
  routeId: string
): Promise<PredictionWithOutcome[]> {
  const result = await pool.query(`
    SELECT 
      sp.*,
      s.status as stop_status
    FROM stop_predictions sp
    JOIN stops s ON s.id = sp.stop_id
    WHERE sp.route_id = $1
    ORDER BY sp.predicted_at ASC
  `, [routeId]);
  
  return result.rows.map(row => ({
    prediction: {
      stopId: row.stop_id,
      routeId: row.route_id,
      driverId: row.driver_id,
      confidence: row.predicted_confidence,
      lat: row.predicted_lat,
      lng: row.predicted_lng,
      etaMinutes: row.predicted_eta_minutes,
      completionTimeMinutes: row.predicted_completion_time_minutes,
      parkingDifficulty: row.predicted_parking_difficulty,
      accessDifficulty: row.predicted_access_difficulty,
      completionProbability: row.predicted_completion_probability,
    },
    outcome: {
      stopId: row.stop_id,
      routeId: row.route_id,
      completionTimeMinutes: row.actual_completion_time_minutes,
      parkingTimeMinutes: row.actual_parking_time_minutes,
      walkingDistanceMetres: row.actual_walking_distance_m,
      success: row.actual_success,
      failureReason: row.failure_reason,
      driverOverride: row.driver_override,
    },
    correct: {
      confidence: row.predicted_confidence === 'HIGH' && row.actual_success,
      parking: false, // Would need actual parking difficulty recorded
      access: false,  // Would need actual access difficulty recorded
      eta: Math.abs((row.predicted_eta_minutes ?? 0) - (row.actual_completion_time_minutes ?? 0)) <= 5,
    },
    errors: {
      confidenceDelta: row.actual_success ? 1 : 0,
      etaErrorMinutes: (row.predicted_eta_minutes ?? 0) - (row.actual_completion_time_minutes ?? 0),
    },
  }));
}

// ─── Event Recording ────────────────────────────────────────────────────────────

export type DeliveryEventType = 
  | 'stop_started'
  | 'stop_completed'
  | 'stop_failed'
  | 'parking_search_started'
  | 'parking_found'
  | 'gate_code_entered'
  | 'customer_not_home'
  | 'driver_override'
  | 'route_replanned'
  | 'eta_updated';

export interface DeliveryEvent {
  routeId: string;
  stopId?: string;
  driverId: string;
  eventType: DeliveryEventType;
  eventData?: Record<string, unknown>;
}

/**
 * Record a delivery event for learning
 */
export async function recordEvent(event: DeliveryEvent): Promise<void> {
  await pool.query(`
    INSERT INTO delivery_events (route_id, stop_id, driver_id, event_type, event_data)
    VALUES ($1, $2, $3, $4, $5)
  `, [
    event.routeId,
    event.stopId ?? null,
    event.driverId,
    event.eventType,
    JSON.stringify(event.eventData ?? {}),
  ]);
}
