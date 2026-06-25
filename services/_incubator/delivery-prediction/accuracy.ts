/**
 * Prediction Accuracy Tracking
 * 
 * Tracks prediction accuracy to continuously improve the model.
 */

import type { PredictionResult, PredictionRequest } from './types';
import { pool } from '../../services/db/index';

/**
 * Store prediction result for accuracy tracking.
 */
export async function storePredictionResult(result: PredictionResult): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO delivery_prediction_results (
        prediction_id, stop_id, route_id, driver_id,
        predicted_completion_probability, predicted_duration_seconds,
        predicted_parking_difficulty, predicted_access_difficulty,
        predicted_failure_reasons,
        actual_completed, actual_completion_time_seconds,
        actual_parking_time_seconds, actual_walking_distance_metres,
        actual_entrance_used, actual_failure_reason,
        driver_feedback,
        completion_correct, duration_error_seconds,
        parking_difficulty_correct, accuracy_score,
        predicted_at, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    `, [
      result.predictionId,
      result.stopId,
      result.routeId,
      result.driverId,
      result.predicted.completionProbability,
      result.predicted.durationSeconds,
      result.predicted.parkingDifficulty,
      result.predicted.accessDifficulty,
      JSON.stringify(result.predicted.failureReasons),
      result.actual.completed,
      result.actual.completionTimeSeconds,
      result.actual.parkingTimeSeconds,
      result.actual.walkingDistanceMetres,
      result.actual.actualEntrance,
      result.actual.failureReason,
      result.actual.driverFeedback,
      result.accuracy.completionCorrect,
      result.accuracy.durationErrorSeconds,
      result.accuracy.parkingDifficultyCorrect,
      result.accuracy.accuracyScore,
      result.predictedAt,
      result.completedAt,
    ]);
  } catch (err) {
    console.error('[prediction] Failed to store prediction result:', err);
  }
}

/**
 * Get prediction accuracy metrics for a time period.
 */
export async function getAccuracyMetrics(
  startDate: Date,
  endDate: Date
): Promise<{
  overallAccuracy: number;
  completionAccuracy: number;
  durationAccuracy: number;
  parkingAccuracy: number;
  sampleSize: number;
  calibration: Array<{
    predictedProbability: string;
    actualSuccessRate: number;
    count: number;
  }>;
}> {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total,
      AVG(accuracy_score) as overall_accuracy,
      AVG(accuracy_score) FILTER (WHERE completion_correct = true) as completion_accuracy,
      AVG(ABS(duration_error_seconds)) FILTER (WHERE duration_error_seconds IS NOT NULL) as duration_accuracy,
      COUNT(*) FILTER (WHERE parking_difficulty_correct = true)::float / 
        GREATEST(COUNT(*) FILTER (WHERE predicted_parking_difficulty IS NOT NULL), 1) as parking_accuracy
    FROM delivery_prediction_results
    WHERE predicted_at >= $1 AND predicted_at <= $2
  `, [startDate, endDate]);
  
  const row = result.rows[0] ?? {};
  
  // Get calibration data
  const calibrationResult = await pool.query(`
    SELECT 
      CASE 
        WHEN predicted_completion_probability >= 0.9 THEN 'HIGH (90%+)'
        WHEN predicted_completion_probability >= 0.7 THEN 'MEDIUM (70-90%)'
        WHEN predicted_completion_probability >= 0.5 THEN 'LOW (50-70%)'
        ELSE 'VERY_LOW (<50%)'
      END as predicted_bucket,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE actual_completed = true)::float / COUNT(*) as actual_rate
    FROM delivery_prediction_results
    WHERE predicted_at >= $1 AND predicted_at <= $2
    GROUP BY predicted_bucket
    ORDER BY predicted_bucket
  `, [startDate, endDate]);
  
  const calibration = calibrationResult.rows.map(r => ({
    predictedProbability: r.predicted_bucket,
    actualSuccessRate: Math.round(Number(r.actual_rate) * 1000) / 10,
    count: Number(r.count),
  }));
  
  return {
    overallAccuracy: Math.round(Number(row.overall_accuracy) * 10) / 10 || 0,
    completionAccuracy: Math.round(Number(row.completion_accuracy) * 10) / 10 || 0,
    durationAccuracy: Math.round(Number(row.duration_accuracy) || 0),
    parkingAccuracy: Math.round(Number(row.parking_accuracy) * 1000) / 10 || 0,
    sampleSize: Number(row.total) || 0,
    calibration,
  };
}

/**
 * Calculate accuracy score for a prediction result.
 */
export function calculateAccuracyScore(
  predicted: PredictionResult['predicted'],
  actual: PredictionResult['actual']
): PredictionResult['accuracy'] {
  // Completion accuracy
  const predictedSuccess = predicted.completionProbability >= 0.5;
  const completionCorrect = predictedSuccess === actual.completed;
  
  // Duration accuracy (within 30% of actual)
  let durationErrorSeconds: number | undefined;
  let durationAccuracy = 100;
  
  if (actual.completionTimeSeconds && predicted.durationSeconds) {
    durationErrorSeconds = Math.abs(actual.completionTimeSeconds - predicted.durationSeconds);
    const errorPercent = durationErrorSeconds / Math.max(actual.completionTimeSeconds, 1);
    durationAccuracy = Math.max(0, 100 - errorPercent * 100);
  }
  
  // Parking difficulty accuracy
  const parkingDifficultyCorrect = 
    predicted.parkingDifficulty === 'EASY' && actual.completionTimeSeconds && actual.completionTimeSeconds < 120 ||
    predicted.parkingDifficulty === 'MODERATE' && actual.completionTimeSeconds && actual.completionTimeSeconds >= 120 && actual.completionTimeSeconds < 300 ||
    predicted.parkingDifficulty === 'HARD' && actual.completionTimeSeconds && actual.completionTimeSeconds >= 300;
  
  // Overall accuracy score (weighted average)
  const accuracyScore = Math.round(
    (completionCorrect ? 50 : 0) +
    (durationAccuracy * 0.3) +
    (parkingDifficultyCorrect ? 20 : 0)
  );
  
  return {
    completionCorrect,
    durationErrorSeconds,
    parkingDifficultyCorrect,
    accuracyScore: Math.min(100, accuracyScore),
  };
}

/**
 * Check if predictions are well-calibrated.
 */
export function checkCalibration(
  metrics: ReturnType<typeof getAccuracyMetrics> extends Promise<infer T> ? T : never
): {
  isWellCalibrated: boolean;
  bias: 'OVERCONFIDENT' | 'UNDERCONFIDENT' | 'CALIBRATED';
  issues: string[];
} {
  const issues: string[] = [];
  let bias: 'OVERCONFIDENT' | 'UNDERCONFIDENT' | 'CALIBRATED' = 'CALIBRATED';
  
  for (const bucket of metrics.calibration) {
    const [bucketLabel, predictedRate] = parseBucketLabel(bucket.predictedProbability);
    
    if (bucket.count >= 10) {
      const actualRate = bucket.actualSuccessRate / 100;
      const difference = actualRate - predictedRate;
      
      if (difference < -0.1) {
        issues.push(`${bucketLabel}: Overconfident (predicted ${predictedRate * 100}%, actual ${bucket.actualSuccessRate}%)`);
        bias = 'OVERCONFIDENT';
      } else if (difference > 0.1) {
        issues.push(`${bucketLabel}: Underconfident (predicted ${predictedRate * 100}%, actual ${bucket.actualSuccessRate}%)`);
        bias = 'UNDERCONFIDENT';
      }
    }
  }
  
  return {
    isWellCalibrated: issues.length === 0,
    bias,
    issues,
  };
}

function parseBucketLabel(label: string): [string, number] {
  if (label.includes('90%')) return ['HIGH', 0.9];
  if (label.includes('70-90')) return ['MEDIUM', 0.8];
  if (label.includes('50-70')) return ['LOW', 0.6];
  return ['VERY_LOW', 0.3];
}
