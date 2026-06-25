/**
 * Delivery Learning — Prediction Analytics
 * 
 * Analyzes prediction accuracy and calculates confidence calibration.
 */

import { pool } from '../../services/db/index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PredictionAccuracy {
  metric: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  avgError?: number;
  description: string;
}

export interface AccuracyReport {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  overallAccuracy: number;
  metrics: PredictionAccuracy[];
  confidenceCalibration: ConfidenceCalibration[];
  etaAccuracy: EtaAccuracy;
  parkingAccuracy: ParkingAccuracy;
  completionAccuracy: CompletionAccuracy;
}

export interface ConfidenceCalibration {
  predictedConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  actualSuccessRate: number;
  predictedRate: number;
  calibration: 'correct' | 'overconfident' | 'underconfident';
}

export interface EtaAccuracy {
  totalPredictions: number;
  avgErrorMinutes: number;
  within5Min: number;
  within10Min: number;
  within30Min: number;
}

export interface ParkingAccuracy {
  totalPredictions: number;
  correctDifficulty: number;
  avgSearchTimeMinutes: number;
}

export interface CompletionAccuracy {
  totalPredictions: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  successRate: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
}

// ─── Analytics Functions ─────────────────────────────────────────────────────

/**
 * Calculate prediction accuracy for a time period
 */
export async function calculateAccuracyReport(
  periodStart: Date,
  periodEnd: Date
): Promise<AccuracyReport> {
  // Get all predictions with outcomes in the period
  const predictionsResult = await pool.query(`
    SELECT 
      predicted_confidence,
      predicted_eta_minutes,
      predicted_completion_time_minutes,
      predicted_parking_difficulty,
      predicted_completion_probability,
      actual_completion_time_minutes,
      actual_parking_time_minutes,
      actual_success,
      failure_reason,
      predicted_at
    FROM stop_predictions
    WHERE predicted_at >= $1 
      AND predicted_at <= $2
      AND actual_success IS NOT NULL
    ORDER BY predicted_at DESC
  `, [periodStart, periodEnd]);

  const predictions = predictionsResult.rows;
  const now = new Date();

  // Calculate overall accuracy
  const successful = predictions.filter(p => p.actual_success).length;
  const overallAccuracy = predictions.length > 0 
    ? successful / predictions.length 
    : 0;

  // Calculate individual metrics
  const metrics: PredictionAccuracy[] = [];

  // Confidence accuracy
  const highConfidence = predictions.filter(p => p.predicted_confidence === 'HIGH');
  const highCorrect = highConfidence.filter(p => p.actual_success).length;
  metrics.push({
    metric: 'Confidence HIGH → Success',
    totalPredictions: highConfidence.length,
    correctPredictions: highCorrect,
    accuracy: highConfidence.length > 0 ? highCorrect / highConfidence.length : 0,
    description: 'When confidence is HIGH, how often is delivery successful?',
  });

  // ETA accuracy (within 5 minutes)
  const etaPredictions = predictions.filter(
    p => p.predicted_eta_minutes != null && p.actual_completion_time_minutes != null
  );
  const etaCorrect = etaPredictions.filter(p => 
    Math.abs(p.predicted_eta_minutes - p.actual_completion_time_minutes) <= 5
  ).length;
  metrics.push({
    metric: 'ETA within 5 minutes',
    totalPredictions: etaPredictions.length,
    correctPredictions: etaCorrect,
    accuracy: etaPredictions.length > 0 ? etaCorrect / etaPredictions.length : 0,
    avgError: etaPredictions.length > 0 
      ? etaPredictions.reduce((sum, p) => 
          sum + Math.abs(p.predicted_eta_minutes - p.actual_completion_time_minutes), 0
        ) / etaPredictions.length
      : undefined,
    description: 'How often is ETA prediction within 5 minutes of actual?',
  });

  // Calculate confidence calibration
  const confidenceCalibration = await calculateConfidenceCalibration(predictions);

  // Calculate ETA accuracy details
  const etaAccuracy = calculateEtaAccuracy(etaPredictions);

  // Calculate parking accuracy
  const parkingAccuracy = await calculateParkingAccuracy(predictions);

  // Calculate completion accuracy
  const completionAccuracy = calculateCompletionAccuracy(predictions);

  return {
    generatedAt: now,
    periodStart,
    periodEnd,
    overallAccuracy,
    metrics,
    confidenceCalibration,
    etaAccuracy,
    parkingAccuracy,
    completionAccuracy,
  };
}

/**
 * Calculate confidence calibration
 */
async function calculateConfidenceCalibration(
  predictions: Array<{
    predicted_confidence: string | null;
    actual_success: boolean | null;
  }>
): Promise<ConfidenceCalibration[]> {
  const calibration: ConfidenceCalibration[] = [];
  
  for (const level of ['HIGH', 'MEDIUM', 'LOW'] as const) {
    const filtered = predictions.filter(p => p.predicted_confidence === level);
    const successRate = filtered.length > 0 
      ? filtered.filter(p => p.actual_success).length / filtered.length 
      : 0;
    
    // Expected success rates based on confidence
    const expectedRate = level === 'HIGH' ? 0.95 : level === 'MEDIUM' ? 0.8 : 0.5;
    
    let cal: 'correct' | 'overconfident' | 'underconfident';
    if (Math.abs(successRate - expectedRate) < 0.1) {
      cal = 'correct';
    } else if (successRate < expectedRate) {
      cal = 'overconfident'; // We predicted higher than reality
    } else {
      cal = 'underconfident'; // Reality better than prediction
    }
    
    calibration.push({
      predictedConfidence: level,
      actualSuccessRate: Math.round(successRate * 100) / 100,
      predictedRate: expectedRate,
      calibration: cal,
    });
  }
  
  return calibration;
}

/**
 * Calculate ETA accuracy details
 */
function calculateEtaAccuracy(
  predictions: Array<{
    predicted_eta_minutes: number | null;
    actual_completion_time_minutes: number | null;
  }>
): EtaAccuracy {
  if (predictions.length === 0) {
    return {
      totalPredictions: 0,
      avgErrorMinutes: 0,
      within5Min: 0,
      within10Min: 0,
      within30Min: 0,
    };
  }
  
  const errors = predictions.map(p => 
    Math.abs((p.predicted_eta_minutes ?? 0) - (p.actual_completion_time_minutes ?? 0))
  );
  
  return {
    totalPredictions: predictions.length,
    avgErrorMinutes: Math.round(errors.reduce((a, b) => a + b, 0) / errors.length * 10) / 10,
    within5Min: errors.filter(e => e <= 5).length,
    within10Min: errors.filter(e => e <= 10).length,
    within30Min: errors.filter(e => e <= 30).length,
  };
}

/**
 * Calculate parking prediction accuracy
 */
async function calculateParkingAccuracy(
  predictions: Array<{
    predicted_parking_difficulty: string | null;
    actual_parking_time_minutes: number | null;
  }>
): Promise<ParkingAccuracy> {
  const withParkingPrediction = predictions.filter(p => p.predicted_parking_difficulty != null);
  
  // For now, approximate accuracy by parking time correlation
  // Hard predictions should have longer actual times
  const correctDifficulty = withParkingPrediction.filter(p => {
    if (p.predicted_parking_difficulty === 'HARD') {
      return (p.actual_parking_time_minutes ?? 0) > 5;
    } else if (p.predicted_parking_difficulty === 'EASY') {
      return (p.actual_parking_time_minutes ?? 0) <= 3;
    }
    return true; // MODERATE - accept any time
  }).length;
  
  const avgSearchTime = withParkingPrediction.length > 0
    ? withParkingPrediction.reduce((sum, p) => sum + (p.actual_parking_time_minutes ?? 0), 0) / withParkingPrediction.length
    : 0;
  
  return {
    totalPredictions: withParkingPrediction.length,
    correctDifficulty: correctDifficulty,
    avgSearchTimeMinutes: Math.round(avgSearchTime * 10) / 10,
  };
}

/**
 * Calculate completion accuracy and failure reasons
 */
function calculateCompletionAccuracy(
  predictions: Array<{
    actual_success: boolean | null;
    failure_reason: string | null;
  }>
): CompletionAccuracy {
  const withOutcome = predictions.filter(p => p.actual_success !== null);
  const successful = withOutcome.filter(p => p.actual_success).length;
  const failed = withOutcome.filter(p => !p.actual_success).length;
  
  // Count failure reasons
  const reasonCounts = new Map<string, number>();
  withOutcome.filter(p => !p.actual_success).forEach(p => {
    const reason = p.failure_reason ?? 'unknown';
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  });
  
  const topFailureReasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  return {
    totalPredictions: withOutcome.length,
    successfulDeliveries: successful,
    failedDeliveries: failed,
    successRate: withOutcome.length > 0 ? successful / withOutcome.length : 0,
    topFailureReasons,
  };
}

/**
 * Get accuracy trends over time
 */
export async function getAccuracyTrends(
  weeks: number = 4
): Promise<Array<{ week: string; accuracy: number; sampleSize: number }>> {
  const result = await pool.query(`
    SELECT 
      DATE_TRUNC('week', predicted_at) as week,
      COUNT(*) as sample_size,
      COUNT(*) FILTER (WHERE actual_success = TRUE) as successes
    FROM stop_predictions
    WHERE predicted_at >= NOW() - INTERVAL '${weeks} weeks'
      AND actual_success IS NOT NULL
    GROUP BY DATE_TRUNC('week', predicted_at)
    ORDER BY week DESC
  `);
  
  return result.rows.map(row => ({
    week: row.week.toISOString(),
    accuracy: row.sample_size > 0 ? row.successes / row.sample_size : 0,
    sampleSize: row.sample_size,
  }));
}
