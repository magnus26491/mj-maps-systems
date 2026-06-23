/**
 * Intelligence Confidence Engine
 * 
 * Tracks recommendation accuracy internally.
 * Never exposes numbers to drivers.
 */

import { pool } from '../../services/db/index';

export interface RecommendationType {
  type: 'PARKING_SPOT' | 'ENTRANCE' | 'TIME_WINDOW' | 'ROUTE' | 'PARKING_DIFFICULTY';
  recommendation: string;
}

export interface AccuracyMetrics {
  recommendationType: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracyRate: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  recentAccuracy: number; // Last 30 days
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
}

export interface RecommendationAccuracy {
  recommendationId: string;
  type: RecommendationType['type'];
  addressNormalized: string;
  
  // What was predicted
  predictedOutcome: string;
  
  // What actually happened
  actualOutcome: string;
  correct: boolean;
  
  // Metadata
  predictedAt: Date;
  actualAt?: Date;
}

// ─── Prediction Recording ─────────────────────────────────────────────────────────

/**
 * Record a recommendation prediction.
 */
export async function recordPrediction(
  recommendationId: string,
  type: RecommendationType['type'],
  addressNormalized: string,
  predictedOutcome: string
): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO recommendation_predictions (
        recommendation_id, type, address_normalized, 
        predicted_outcome, predicted_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [recommendationId, type, addressNormalized, predictedOutcome]);
  } catch (err) {
    console.error('[intelligence-confidence] Failed to record prediction:', err);
  }
}

/**
 * Record actual outcome and calculate accuracy.
 */
export async function recordActualOutcome(
  recommendationId: string,
  actualOutcome: string
): Promise<void> {
  try {
    // Update prediction with actual outcome
    const result = await pool.query(`
      UPDATE recommendation_predictions
      SET 
        actual_outcome = $2,
        correct = (predicted_outcome = $2),
        actual_at = NOW()
      WHERE recommendation_id = $1
      RETURNING correct
    `, [recommendationId, actualOutcome]);
    
    // If correct, increment success counter
    if (result.rows[0]?.correct) {
      await pool.query(`
        UPDATE recommendation_accuracy
        SET 
          correct_count = correct_count + 1,
          total_count = total_count + 1,
          accuracy_rate = (correct_count + 1)::decimal / (total_count + 1),
          updated_at = NOW()
        WHERE type = (SELECT type FROM recommendation_predictions WHERE recommendation_id = $1)
      `, [recommendationId]);
    } else {
      await pool.query(`
        UPDATE recommendation_accuracy
        SET 
          total_count = total_count + 1,
          accuracy_rate = correct_count::decimal / (total_count + 1),
          updated_at = NOW()
        WHERE type = (SELECT type FROM recommendation_predictions WHERE recommendation_id = $1)
      `, [recommendationId]);
    }
  } catch (err) {
    console.error('[intelligence-confidence] Failed to record outcome:', err);
  }
}

// ─── Accuracy Retrieval ───────────────────────────────────────────────────────────

/**
 * Get accuracy metrics for a recommendation type.
 */
export async function getAccuracyMetrics(
  type: RecommendationType['type']
): Promise<AccuracyMetrics | null> {
  const result = await pool.query(`
    SELECT 
      type,
      total_count as total_predictions,
      correct_count as correct_predictions,
      accuracy_rate,
      sample_size,
      updated_at
    FROM recommendation_accuracy
    WHERE type = $1
  `, [type]);
  
  const row = result.rows[0];
  if (!row) return null;
  
  const totalPredictions = Number(row.total_predictions);
  const accuracyRate = Number(row.accuracy_rate);
  
  // Calculate confidence based on sample size
  let confidence: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (totalPredictions >= 50) confidence = 'HIGH';
  else if (totalPredictions >= 10) confidence = 'MEDIUM';
  
  // Calculate recent accuracy (last 30 days)
  const recentResult = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE correct) as recent_correct,
      COUNT(*) as recent_total
    FROM recommendation_predictions
    WHERE type = $1 AND predicted_at > NOW() - INTERVAL '30 days'
  `, [type]);
  
  const recentRow = recentResult.rows[0];
  const recentTotal = Number(recentRow.recent_total) || 0;
  const recentCorrect = Number(recentRow.recent_correct) || 0;
  const recentAccuracy = recentTotal > 0 ? recentCorrect / recentTotal : 0;
  
  // Determine trend
  let trend: 'IMPROVING' | 'STABLE' | 'DECLINING' = 'STABLE';
  if (recentAccuracy > accuracyRate + 0.05) trend = 'IMPROVING';
  else if (recentAccuracy < accuracyRate - 0.05) trend = 'DECLINING';
  
  return {
    recommendationType: row.type,
    totalPredictions,
    correctPredictions: Number(row.correct_predictions),
    accuracyRate: Math.round(accuracyRate * 1000) / 10,
    confidence,
    recentAccuracy: Math.round(recentAccuracy * 1000) / 10,
    trend,
  };
}

/**
 * Get all accuracy metrics.
 */
export async function getAllAccuracyMetrics(): Promise<AccuracyMetrics[]> {
  const result = await pool.query(`
    SELECT * FROM recommendation_accuracy ORDER BY total_count DESC
  `);
  
  const metrics: AccuracyMetrics[] = [];
  for (const row of result.rows) {
    const m = await getAccuracyMetrics(row.type);
    if (m) metrics.push(m);
  }
  
  return metrics;
}

// ─── Recommendation Decision Helper ─────────────────────────────────────────────

/**
 * Decide whether to make a recommendation based on accuracy.
 * Returns null if confidence is too low.
 */
export async function shouldMakeRecommendation(
  type: RecommendationType['type'],
  minAccuracyThreshold = 0.7
): Promise<{ confidence: 'LOW' | 'MEDIUM' | 'HIGH'; accuracy: number } | null> {
  const metrics = await getAccuracyMetrics(type);
  
  if (!metrics) return null;
  if (metrics.accuracyRate < minAccuracyThreshold * 100) return null;
  
  return {
    confidence: metrics.confidence,
    accuracy: metrics.accuracyRate,
  };
}

/**
 * Get learning-adjusted confidence for a specific address.
 */
export async function getAddressConfidence(
  addressNormalized: string
): Promise<{
  parking: 'LOW' | 'MEDIUM' | 'HIGH';
  entrance: 'LOW' | 'MEDIUM' | 'HIGH';
  timing: 'LOW' | 'MEDIUM' | 'HIGH';
}> {
  const result = await pool.query(`
    SELECT 
      type,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE correct) as correct
    FROM recommendation_predictions
    WHERE address_normalized = $1
    GROUP BY type
  `, [addressNormalized]);
  
  const counts: Record<string, { total: number; correct: number }> = {};
  for (const row of result.rows) {
    counts[row.type] = {
      total: Number(row.count),
      correct: Number(row.correct),
    };
  }
  
  const getConfidence = (type: string): 'LOW' | 'MEDIUM' | 'HIGH' => {
    const data = counts[type];
    if (!data || data.total < 3) return 'LOW';
    if (data.total >= 20 && data.correct / data.total >= 0.9) return 'HIGH';
    return 'MEDIUM';
  };
  
  return {
    parking: getConfidence('PARKING_SPOT') || getConfidence('PARKING_DIFFICULTY'),
    entrance: getConfidence('ENTRANCE'),
    timing: getConfidence('TIME_WINDOW'),
  };
}

// ─── Trust Signal Generation ─────────────────────────────────────────────────────

/**
 * Generate human-readable trust signal for UI.
 * Never shows numbers directly.
 */
export function generateTrustSignal(
  confidence: 'LOW' | 'MEDIUM' | 'HIGH',
  type: string
): string {
  switch (confidence) {
    case 'HIGH':
      return 'Known location';
    case 'MEDIUM':
      return 'Based on previous deliveries';
    case 'LOW':
    default:
      return 'Limited data available';
  }
}

/**
 * Generate specific trust signal for parking.
 */
export function generateParkingTrustSignal(
  confidence: 'LOW' | 'MEDIUM' | 'HIGH',
  sampleCount: number
): string {
  switch (confidence) {
    case 'HIGH':
      return 'Known parking here';
    case 'MEDIUM':
      if (sampleCount >= 5) return 'Parking info from previous deliveries';
      return 'Some parking experience here';
    case 'LOW':
    default:
      return 'Limited parking data';
  }
}

/**
 * Generate trust signal for entrance.
 */
export function generateEntranceTrustSignal(
  confidence: 'LOW' | 'MEDIUM' | 'HIGH',
  successRate: number
): string {
  switch (confidence) {
    case 'HIGH':
      return successRate >= 0.9 ? 'Rear entrance usually succeeds' : 'Best entrance confirmed';
    case 'MEDIUM':
      return 'Access info available';
    case 'LOW':
    default:
      return 'Access varies here';
  }
}
