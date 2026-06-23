/**
 * Driver Memory Service
 * 
 * Personal intelligence layer that learns from every delivery.
 * Combines: Global Intelligence + Driver History + Vehicle History + Fleet Similarity
 */

import { pool } from '../db/index';
import type { DriverStopMemory, VehicleMemory, CombinedMemory, MemoryEvidence } from './types';

// ─── Weights ────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  currentConditions: 0.5,
  driverMemory: 0.3,
  fleetIntelligence: 0.2,
};

// ─── Memory Retrieval ───────────────────────────────────────────────────────────

/**
 * Get driver memory for a specific stop.
 */
export async function getDriverStopMemory(
  driverId: string,
  addressNormalized: string
): Promise<DriverStopMemory | null> {
  const result = await pool.query(`
    SELECT * FROM driver_stop_memory
    WHERE driver_id = $1 AND LOWER(address_normalized) = LOWER($2)
  `, [driverId, addressNormalized]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  return {
    driverId: row.driver_id,
    addressNormalized: row.address_normalized,
    successfulDeliveries: Number(row.successful_deliveries),
    failedDeliveries: Number(row.failed_deliveries),
    lastDeliveryDate: row.last_delivery_date,
    averageCompletionTimeSeconds: Number(row.avg_completion_seconds),
    preferredParking: row.preferred_parking,
    preferredApproach: row.preferred_approach,
    preferredEntrance: row.preferred_entrance,
    walkingToleranceMetres: Number(row.walking_tolerance_metres),
    problemsEncountered: row.problems_encountered || [],
    lastProblemDate: row.last_problem_date,
    vehicleHistory: row.vehicle_history || [],
    fleetSuccessRate: Number(row.fleet_success_rate || 0),
    similarDriverCount: Number(row.similar_driver_count || 0),
    memoryConfidence: row.memory_confidence || 'LOW',
    sampleSize: Number(row.sample_size),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get all memory for a driver (for route optimization).
 */
export async function getDriverRouteMemory(
  driverId: string,
  addressNormalizeds: string[]
): Promise<Map<string, DriverStopMemory>> {
  if (addressNormalizeds.length === 0) {
    return new Map();
  }
  
  const placeholders = addressNormalizeds.map((_, i) => `$${i + 2}`).join(',');
  const result = await pool.query(`
    SELECT * FROM driver_stop_memory
    WHERE driver_id = $1 
    AND LOWER(address_normalized) IN (${placeholders})
  `, [driverId, ...addressNormalizeds.map(a => a.toLowerCase())]);
  
  const memoryMap = new Map<string, DriverStopMemory>();
  for (const row of result.rows) {
    const memory: DriverStopMemory = {
      driverId: row.driver_id,
      addressNormalized: row.address_normalized,
      successfulDeliveries: Number(row.successful_deliveries),
      failedDeliveries: Number(row.failed_deliveries),
      lastDeliveryDate: row.last_delivery_date,
      averageCompletionTimeSeconds: Number(row.avg_completion_seconds),
      preferredParking: row.preferred_parking,
      preferredApproach: row.preferred_approach,
      preferredEntrance: row.preferred_entrance,
      walkingToleranceMetres: Number(row.walking_tolerance_metres),
      problemsEncountered: row.problems_encountered || [],
      lastProblemDate: row.last_problem_date,
      vehicleHistory: row.vehicle_history || [],
      fleetSuccessRate: Number(row.fleet_success_rate || 0),
      similarDriverCount: Number(row.similar_driver_count || 0),
      memoryConfidence: row.memory_confidence || 'LOW',
      sampleSize: Number(row.sample_size),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    memoryMap.set(row.address_normalized.toLowerCase(), memory);
  }
  
  return memoryMap;
}

// ─── Memory Update ─────────────────────────────────────────────────────────────

/**
 * Update driver memory after a delivery.
 */
export async function updateDriverMemory(
  driverId: string,
  addressNormalized: string,
  delivery: {
    vehicleId: string;
    success: boolean;
    completionTimeSeconds: number;
    parkingUsed?: string;
    approachUsed?: string;
    entranceUsed?: string;
    walkingDistanceMetres?: number;
    problems?: string[];
  }
): Promise<void> {
  const addressLower = addressNormalized.toLowerCase();
  
  // Check if memory exists
  const existing = await getDriverStopMemory(driverId, addressNormalized);
  
  if (existing) {
    // Update existing memory
    const newDeliveries = existing.successfulDeliveries + (delivery.success ? 1 : 0);
    const newFailures = existing.failedDeliveries + (delivery.success ? 0 : 1);
    const newAvgTime = (
      (existing.averageCompletionTimeSeconds * existing.successfulDeliveries + 
       (delivery.success ? delivery.completionTimeSeconds : 0)) /
      Math.max(newDeliveries, 1)
    );
    
    // Update parking preference (most common)
    const parkingHistory = [...(existing.vehicleHistory || [])];
    const vehicleIndex = parkingHistory.findIndex(v => v.vehicleId === delivery.vehicleId);
    if (vehicleIndex >= 0) {
      parkingHistory[vehicleIndex] = {
        ...parkingHistory[vehicleIndex],
        deliveries: parkingHistory[vehicleIndex].deliveries + 1,
        avgCompletionSeconds: Math.round(newAvgTime),
      };
    } else if (delivery.parkingUsed) {
      parkingHistory.push({
        vehicleId: delivery.vehicleId,
        deliveries: 1,
        successRate: delivery.success ? 1 : 0,
        avgCompletionSeconds: delivery.completionTimeSeconds,
        preferredParking: delivery.parkingUsed,
        preferredApproach: delivery.approachUsed,
      });
    }
    
    // Calculate confidence
    const memoryConfidence: 'LOW' | 'MEDIUM' | 'HIGH' = 
      newDeliveries >= 20 ? 'HIGH' :
      newDeliveries >= 5 ? 'MEDIUM' : 'LOW';
    
    await pool.query(`
      UPDATE driver_stop_memory
      SET 
        successful_deliveries = $3,
        failed_deliveries = $4,
        last_delivery_date = NOW(),
        avg_completion_seconds = $5,
        preferred_parking = COALESCE($6, preferred_parking),
        preferred_approach = COALESCE($7, preferred_approach),
        preferred_entrance = COALESCE($8, preferred_entrance),
        walking_tolerance_metres = COALESCE($9, walking_tolerance_metres),
        problems_encountered = $10,
        last_problem_date = CASE WHEN $11::text[] IS NOT NULL THEN NOW() ELSE last_problem_date END,
        vehicle_history = $12,
        memory_confidence = $13,
        sample_size = sample_size + 1,
        updated_at = NOW()
      WHERE driver_id = $1 AND LOWER(address_normalized) = $2
    `, [
      driverId,
      addressLower,
      newDeliveries,
      newFailures,
      Math.round(newAvgTime),
      delivery.parkingUsed,
      delivery.approachUsed,
      delivery.entranceUsed,
      delivery.walkingDistanceMetres,
      delivery.problems,
      delivery.problems?.length > 0 ? delivery.problems : null,
      JSON.stringify(parkingHistory),
      memoryConfidence,
    ]);
  } else {
    // Create new memory
    const vehicleHistory: VehicleMemory[] = delivery.parkingUsed ? [{
      vehicleId: delivery.vehicleId,
      deliveries: 1,
      successRate: delivery.success ? 1 : 0,
      avgCompletionSeconds: delivery.completionTimeSeconds,
      preferredParking: delivery.parkingUsed,
      preferredApproach: delivery.approachUsed,
    }] : [];
    
    await pool.query(`
      INSERT INTO driver_stop_memory (
        driver_id, address_normalized,
        successful_deliveries, failed_deliveries,
        avg_completion_seconds,
        preferred_parking, preferred_approach, preferred_entrance,
        walking_tolerance_metres,
        problems_encountered, last_problem_date,
        vehicle_history, fleet_success_rate, similar_driver_count,
        memory_confidence, sample_size,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
    `, [
      driverId,
      addressLower,
      delivery.success ? 1 : 0,
      delivery.success ? 0 : 1,
      delivery.completionTimeSeconds,
      delivery.parkingUsed,
      delivery.approachUsed,
      delivery.entranceUsed,
      delivery.walkingDistanceMetres,
      delivery.problems,
      delivery.problems?.length ? new Date() : null,
      JSON.stringify(vehicleHistory),
      0.9, // Default fleet rate
      0,   // No similar drivers yet
      delivery.success ? 'MEDIUM' : 'LOW',
      1,
    ]);
  }
}

// ─── Combined Memory ────────────────────────────────────────────────────────────

/**
 * Get combined memory for a stop.
 * Weights: Current conditions (50%) + Driver memory (30%) + Fleet (20%)
 */
export async function getCombinedMemory(
  driverId: string,
  addressNormalized: string,
  currentConditionsScore: number,
  currentConditionsReasons: string[],
  globalParkingSuggestion?: string,
  globalSuccessRate?: number
): Promise<CombinedMemory> {
  const driverMemory = await getDriverStopMemory(driverId, addressNormalized);
  
  // Build evidence
  const evidence: MemoryEvidence = {
    currentConditionsScore,
    currentConditionsReasons,
    driverDeliveries: driverMemory?.successfulDeliveries || 0,
    driverSuccessRate: driverMemory 
      ? driverMemory.successfulDeliveries / Math.max(driverMemory.successfulDeliveries + driverMemory.failedDeliveries, 1)
      : 0,
    driverMemoryScore: driverMemory?.memoryConfidence === 'HIGH' ? 0.9 :
                       driverMemory?.memoryConfidence === 'MEDIUM' ? 0.6 : 0,
    driverMemoryReasons: driverMemory?.successfulDeliveries 
      ? [`Delivered here ${driverMemory.successfulDeliveries} times`]
      : ['No previous deliveries here'],
    fleetDeliveries: driverMemory?.similarDriverCount || 0,
    fleetSuccessRate: driverMemory?.fleetSuccessRate || 0.85,
    fleetScore: driverMemory?.fleetSuccessRate || 0.85,
    fleetReasons: driverMemory?.similarDriverCount 
      ? [`${driverMemory.similarDriverCount} similar deliveries`]
      : ['Limited fleet data'],
  };
  
  // Calculate weighted confidence
  const overallConfidence = Math.min(0.99,
    (currentConditionsScore * WEIGHTS.currentConditions) +
    (evidence.driverMemoryScore * WEIGHTS.driverMemory) +
    (evidence.fleetScore * WEIGHTS.fleetIntelligence)
  );
  
  // Determine recommendations
  let recommendedParking: string | undefined;
  let recommendedApproach: string | undefined;
  let recommendedEntrance: string | undefined;
  
  // Fleet takes precedence if driver has limited history
  if (globalParkingSuggestion && (!driverMemory || driverMemory.successfulDeliveries < 3)) {
    recommendedParking = globalParkingSuggestion;
  } else if (driverMemory?.preferredParking) {
    recommendedParking = driverMemory.preferredParking;
  }
  
  if (driverMemory?.preferredApproach) {
    recommendedApproach = driverMemory.preferredApproach;
  }
  
  if (driverMemory?.preferredEntrance) {
    recommendedEntrance = driverMemory.preferredEntrance;
  }
  
  return {
    addressNormalized,
    recommendedParking,
    recommendedApproach,
    recommendedEntrance,
    walkingDistanceMetres: driverMemory?.walkingToleranceMetres || 50,
    weights: WEIGHTS,
    evidence,
    overallConfidence,
  };
}

// ─── Override Check ─────────────────────────────────────────────────────────────

/**
 * Check if driver memory should override current conditions.
 * Returns a warning if conditions suggest different approach.
 */
export async function checkMemoryOverride(
  driverId: string,
  addressNormalized: string,
  currentConditionWarning?: string
): Promise<{
  hasOverride: boolean;
  reason?: string;
  recommendedAction?: string;
}> {
  const memory = await getDriverStopMemory(driverId, addressNormalized);
  
  if (!memory || memory.successfulDeliveries < 3) {
    return { hasOverride: false };
  }
  
  // If there's a current condition warning and driver consistently succeeds
  if (currentConditionWarning && memory.successRate >= 0.95) {
    return {
      hasOverride: true,
      reason: `Usually successful despite ${currentConditionWarning.toLowerCase()}`,
      recommendedAction: 'Continue normally',
    };
  }
  
  return { hasOverride: false };
}

// ─── Fleet Similarity ────────────────────────────────────────────────────────────

/**
 * Update fleet intelligence for a stop based on similar drivers.
 */
export async function updateFleetIntelligence(
  addressNormalized: string,
  similarDrivers: Array<{
    driverId: string;
    successRate: number;
    deliveries: number;
  }>
): Promise<void> {
  if (similarDrivers.length === 0) return;
  
  const totalDeliveries = similarDrivers.reduce((sum, d) => sum + d.deliveries, 0);
  const weightedSuccess = similarDrivers.reduce(
    (sum, d) => sum + (d.successRate * d.deliveries), 
    0
  ) / Math.max(totalDeliveries, 1);
  
  await pool.query(`
    UPDATE driver_stop_memory
    SET 
      fleet_success_rate = $2,
      similar_driver_count = $3,
      updated_at = NOW()
    WHERE LOWER(address_normalized) = $1
  `, [addressNormalized.toLowerCase(), weightedSuccess, similarDrivers.length]);
}

/**
 * Find similar drivers for a location.
 * Similar = same vehicle type, similar driving pattern.
 */
export async function findSimilarDrivers(
  driverId: string,
  vehicleId: string,
  addressNormalized: string,
  limit = 10
): Promise<Array<{ driverId: string; successRate: number; deliveries: number }>> {
  const result = await pool.query(`
    SELECT 
      dsm.driver_id,
      dsm.successful_deliveries,
      dsm.failed_deliveries,
      dsm.sample_size,
      dsm.preferred_parking
    FROM driver_stop_memory dsm
    WHERE LOWER(dsm.address_normalized) = $1
      AND dsm.driver_id != $2
      AND dsm.vehicle_history::text LIKE '%' || $3 || '%'
      AND dsm.memory_confidence IN ('MEDIUM', 'HIGH')
    ORDER BY dsm.memory_confidence DESC, dsm.sample_size DESC
    LIMIT $4
  `, [addressNormalized.toLowerCase(), driverId, vehicleId, limit]);
  
  return result.rows.map(row => ({
    driverId: row.driver_id,
    successRate: row.successful_deliveries / Math.max(row.successful_deliveries + row.failed_deliveries, 1),
    deliveries: Number(row.sample_size),
  }));
}
