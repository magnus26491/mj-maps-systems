/**
 * Stop Digital Prediction Model
 * 
 * Builds and maintains address-level prediction models from historical data.
 * Every address gradually becomes intelligent.
 */

import type { StopDigitalModel } from './types';
import { pool } from '../../services/db/index';

const STREET_TYPES = ['Street', 'St', 'Avenue', 'Ave', 'Road', 'Rd', 'Lane', 'Ln', 'Drive', 'Dr'];

/**
 * Build stop digital model from historical deliveries.
 */
export async function buildStopModel(address: string): Promise<StopDigitalModel> {
  const normalized = normalizeAddress(address);
  
  // Get delivery history
  const historyResult = await pool.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'delivered') as successful,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      AVG(EXTRACT(EPOCH FROM (completed_at - arrived_at))) FILTER (WHERE completed_at IS NOT NULL) as avg_completion_seconds,
      STDDEV(EXTRACT(EPOCH FROM (completed_at - arrived_at))) FILTER (WHERE completed_at IS NOT NULL) as completion_variance
    FROM stop_delivery_history
    WHERE LOWER(REGEXP_REPLACE(address, '\\s+', ' ', 'g')) = $1
  `, [normalized]);
  
  const history = historyResult.rows[0] ?? {};
  const total = Number(history.total) || 0;
  const successful = Number(history.successful) || 0;
  const failed = Number(history.failed) || 0;
  
  // Get parking history
  const parkingResult = await pool.query(`
    SELECT 
      AVG(parking_distance_metres) as avg_distance,
      COUNT(*) FILTER (WHERE parking_time_seconds > 180) as difficult_count,
      COUNT(*) as total_parking
    FROM parking_history
    WHERE LOWER(REGEXP_REPLACE(address, '\\s+', ' ', 'g')) = $1
  `, [normalized]);
  
  const parking = parkingResult.rows[0] ?? {};
  
  // Get entrance success rates
  const entranceResult = await pool.query(`
    SELECT 
      entrance_location,
      COUNT(*) as attempts,
      COUNT(*) FILTER (WHERE success = true) as successes
    FROM delivery_entrance_history
    WHERE LOWER(REGEXP_REPLACE(address, '\\s+', ' ', 'g')) = $1
    GROUP BY entrance_location
  `, [normalized]);
  
  const entranceRates: Record<string, { rate: number; count: number }> = {};
  let bestEntrance: string = 'UNKNOWN';
  let bestRate = 0;
  
  for (const row of entranceResult.rows) {
    const rate = Number(row.successes) / Math.max(Number(row.attempts), 1);
    entranceRates[row.entrance_location] = { rate, count: Number(row.attempts) };
    if (rate > bestRate) {
      bestRate = rate;
      bestEntrance = row.entrance_location;
    }
  }
  
  // Get time window success rates
  const timeResult = await pool.query(`
    SELECT 
      EXTRACT(HOUR FROM arrived_at) as hour,
      COUNT(*) as attempts,
      COUNT(*) FILTER (WHERE status = 'delivered') as successes
    FROM stop_delivery_history
    WHERE LOWER(REGEXP_REPLACE(address, '\\s+', ' ', 'g')) = $1
      AND arrived_at IS NOT NULL
    GROUP BY EXTRACT(HOUR FROM arrived_at)
    ORDER BY hour
  `, [normalized]);
  
  const timeWindows = timeResult.rows.map(row => ({
    hour: Number(row.hour),
    attempts: Number(row.attempts),
    rate: Number(row.successes) / Math.max(Number(row.attempts), 1),
  }));
  
  // Calculate best and worst windows
  const bestWindows = calculateBestWindows(timeWindows, 3);
  const worstWindows = calculateWorstWindows(timeWindows, 2);
  
  // Determine data freshness
  const dataFreshness = determineFreshness(total);
  
  return {
    address,
    normalizedAddress: normalized,
    totalDeliveries: total,
    successfulDeliveries: successful,
    failedDeliveries: failed,
    successRate: total > 0 ? successful / total : 0.5,
    bestArrivalWindows: bestWindows.map(w => ({
      start: `${String(Math.floor(w.hour)).padStart(2, '0')}:00`,
      end: `${String(Math.floor(w.hour + 2)).padStart(2, '0')}:00`,
      successRate: w.rate,
      sampleSize: w.attempts,
    })),
    worstArrivalWindows: worstWindows.map(w => ({
      start: `${String(Math.floor(w.hour)).padStart(2, '0')}:00`,
      end: `${String(Math.floor(w.hour + 2)).padStart(2, '0')}:00`,
      successRate: w.rate,
      sampleSize: w.attempts,
    })),
    averageParkingDistanceMetres: Number(parking.avg_distance) || 74,
    parkingSuccessRate: Number(parking.total_parking) > 0
      ? 1 - (Number(parking.difficult_count) / Number(parking.total_parking))
      : 0.8,
    worstParkingTime: worstWindows.length > 0
      ? `${String(Math.floor(worstWindows[0].hour)).padStart(2, '0')}:00-${String(Math.floor(worstWindows[0].hour + 2)).padStart(2, '0')}:00`
      : '15:00-17:00',
    bestEntrance: bestEntrance as StopDigitalModel['bestEntrance'],
    bestEntranceSuccessRate: bestRate,
    entranceSuccessRates: entranceRates,
    averageCompletionSeconds: Number(history.avg_completion_seconds) || 360,
    completionTimeVariance: Number(history.completion_variance) || 60,
    customerAvailabilityRate: 0.85, // Simplified
    typicalCustomerPresent: '09:00-17:00',
    lastUpdated: new Date(),
    dataFreshness,
  };
}

/**
 * Update stop model with new delivery data.
 */
export async function updateStopModel(
  address: string,
  deliveryData: {
    completed: boolean;
    completionTimeSeconds?: number;
    parkingTimeSeconds?: number;
    parkingDistanceMetres?: number;
    entranceUsed?: string;
    arrivedAt?: Date;
  }
): Promise<void> {
  const normalized = normalizeAddress(address);
  
  // Insert into delivery history
  await pool.query(`
    INSERT INTO stop_delivery_history (
      address, status, arrived_at, completed_at, completion_seconds
    ) VALUES ($1, $2, $3, $4, $5)
  `, [
    normalized,
    deliveryData.completed ? 'delivered' : 'failed',
    deliveryData.arrivedAt,
    deliveryData.completed ? new Date() : null,
    deliveryData.completionTimeSeconds,
  ]);
  
  // Update parking history if available
  if (deliveryData.parkingTimeSeconds !== undefined) {
    await pool.query(`
      INSERT INTO parking_history (
        address, parking_time_seconds, parking_distance_metres, recorded_at
      ) VALUES ($1, $2, $3, NOW())
    `, [
      normalized,
      deliveryData.parkingTimeSeconds,
      deliveryData.parkingDistanceMetres,
    ]);
  }
  
  // Update entrance history if available
  if (deliveryData.entranceUsed) {
    await pool.query(`
      INSERT INTO delivery_entrance_history (
        address, entrance_location, success, recorded_at
      ) VALUES ($1, $2, $3, NOW())
    `, [
      normalized,
      deliveryData.entranceUsed,
      deliveryData.completed,
    ]);
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────────

function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/, uk$/i, '')
    .replace(/\bst\b/gi, 'street')
    .replace(/\bave\b/gi, 'avenue')
    .replace(/\brd\b/gi, 'road')
    .replace(/\bln\b/gi, 'lane')
    .replace(/\bdr\b/gi, 'drive');
}

function calculateBestWindows(
  windows: Array<{ hour: number; attempts: number; rate: number }>,
  count: number
): Array<{ hour: number; attempts: number; rate: number }> {
  return windows
    .filter(w => w.attempts >= 3) // Minimum sample size
    .sort((a, b) => b.rate - a.rate)
    .slice(0, count);
}

function calculateWorstWindows(
  windows: Array<{ hour: number; attempts: number; rate: number }>,
  count: number
): Array<{ hour: number; attempts: number; rate: number }> {
  return windows
    .filter(w => w.attempts >= 3)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, count);
}

function determineFreshness(totalDeliveries: number): StopDigitalModel['dataFreshness'] {
  if (totalDeliveries >= 50) return 'FRESH';
  if (totalDeliveries >= 10) return 'STALE';
  return 'HISTORICAL';
}

/**
 * Get model summary for display.
 */
export function getModelSummary(model: StopDigitalModel): string {
  if (model.totalDeliveries === 0) {
    return 'New delivery location - limited data available';
  }
  
  const parts: string[] = [];
  
  if (model.totalDeliveries >= 10) {
    parts.push(`${model.totalDeliveries} previous deliveries`);
    parts.push(`${Math.round(model.successRate * 100)}% success rate`);
  }
  
  if (model.bestEntrance !== 'UNKNOWN') {
    parts.push(`Best: ${model.bestEntrance.toLowerCase()} entrance`);
  }
  
  if (model.bestArrivalWindows.length > 0) {
    const best = model.bestArrivalWindows[0];
    parts.push(`Best time: ${best.start}`);
  }
  
  return parts.join('. ');
}
