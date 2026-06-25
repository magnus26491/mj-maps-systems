/**
 * Delivery Learning — Stop Memory
 * 
 * Stores and retrieves learned characteristics for delivery stops.
 * Persistent memory: parking difficulty, access notes, temporal patterns.
 * 
 * IMPORTANT: No personal customer information is stored.
 */

import { pool } from '../../services/db/index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StopMemory {
  addressNormalised: string;
  
  // Physical characteristics
  parkingDifficulty?: 'EASY' | 'MODERATE' | 'HARD' | null;
  parkingNotes?: string | null;
  accessDifficulty?: 'EASY' | 'MODERATE' | 'HARD' | null;
  accessNotes?: string | null;
  requiresWalking?: boolean;
  walkDistanceMetres?: number | null;
  
  // Temporal patterns
  bestTimeOfDay?: 'MORNING' | 'MIDDAY' | 'AFTERNOON' | 'EVENING' | null;
  difficultyAfterPm?: boolean;
  
  // Access details (non-personal)
  hasFlatEntrance?: boolean;
  entranceLocation?: 'FRONT' | 'REAR' | 'SIDE' | null;
  gateCodeKnown?: boolean;
  
  // Delivery patterns
  avgCompletionTimeMinutes?: number | null;
  failureCount?: number;
  successCount?: number;
  lastVisitedAt?: Date | null;
  
  // Metadata
  confidenceScore?: number;
  dataSources?: string;
}

export interface StopMemoryInput {
  address: string;
  parkingDifficulty?: 'EASY' | 'MODERATE' | 'HARD';
  parkingNotes?: string;
  accessDifficulty?: 'EASY' | 'MODERATE' | 'HARD';
  accessNotes?: string;
  requiresWalking?: boolean;
  walkDistanceMetres?: number;
  bestTimeOfDay?: 'MORNING' | 'MIDDAY' | 'AFTERNOON' | 'EVENING';
  difficultyAfterPm?: boolean;
  hasFlatEntrance?: boolean;
  entranceLocation?: 'FRONT' | 'REAR' | 'SIDE';
  gateCodeKnown?: boolean;
  avgCompletionTimeMinutes?: number;
  success?: boolean;
}

export interface StopWithMemory {
  stop: {
    id: string;
    address: string;
    lat: number;
    lng: number;
  };
  memory?: StopMemory;
  deliveryTips?: string[];
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Normalise address for consistent matching
 */
function normaliseAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .replace(/  +/g, ' ')
    .trim();
}

// ─── Memory Operations ────────────────────────────────────────────────────────

/**
 * Get memory for an address
 */
export async function getStopMemory(address: string): Promise<StopMemory | null> {
  const normalised = normaliseAddress(address);
  
  const result = await pool.query(`
    SELECT * FROM stop_memory WHERE address_normalised = $1
  `, [normalised]);
  
  if (result.rows.length === 0) return null;
  
  const row = result.rows[0]!;
  return {
    addressNormalised: row.address_normalised,
    parkingDifficulty: row.parking_difficulty,
    parkingNotes: row.parking_notes,
    accessDifficulty: row.access_difficulty,
    accessNotes: row.access_notes,
    requiresWalking: row.requires_walking,
    walkDistanceMetres: row.walk_distance_metres,
    bestTimeOfDay: row.best_time_of_day,
    difficultyAfterPm: row.difficulty_after_pm,
    hasFlatEntrance: row.has_flat_entrance,
    entranceLocation: row.entrance_location,
    gateCodeKnown: row.gate_code_known,
    avgCompletionTimeMinutes: row.avg_completion_time_minutes,
    failureCount: row.failure_count,
    successCount: row.success_count,
    lastVisitedAt: row.last_visited_at,
    confidenceScore: row.confidence_score,
    dataSources: row.data_sources,
  };
}

/**
 * Store or update memory for an address
 */
export async function updateStopMemory(
  address: string,
  input: StopMemoryInput
): Promise<StopMemory> {
  const normalised = normaliseAddress(address);
  
  // Get existing record
  const existing = await getStopMemory(address);
  
  // Calculate new averages
  const existingSuccesses = existing?.successCount ?? 0;
  const existingFailures = existing?.failureCount ?? 0;
  const existingAvgTime = existing?.avgCompletionTimeMinutes ?? 4; // Default 4 min
  
  const newSuccesses = existingSuccesses + (input.success === true ? 1 : 0);
  const newFailures = existingFailures + (input.success === false ? 1 : 0);
  const totalDeliveries = newSuccesses + newFailures;
  
  // Calculate new average completion time (exponential moving average)
  const alpha = 0.3; // Smoothing factor
  const newAvgTime = input.avgCompletionTimeMinutes !== undefined
    ? alpha * input.avgCompletionTimeMinutes + (1 - alpha) * existingAvgTime
    : existingAvgTime;
  
  // Calculate confidence score based on data volume
  const confidenceScore = Math.min(1.0, totalDeliveries / 10);
  
  // Build data sources string
  const sources = new Set((existing?.dataSources ?? '').split(',').filter(Boolean));
  sources.add('DRIVER_REPORT');
  
  await pool.query(`
    INSERT INTO stop_memory (
      address_normalised,
      parking_difficulty, parking_notes,
      access_difficulty, access_notes,
      requires_walking, walk_distance_metres,
      best_time_of_day, difficulty_after_pm,
      has_flat_entrance, entrance_location, gate_code_known,
      avg_completion_time_minutes, failure_count, success_count,
      last_visited_at, confidence_score, data_sources
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), $16, $17)
    ON CONFLICT (address_normalised) DO UPDATE SET
      parking_difficulty = COALESCE($2, stop_memory.parking_difficulty),
      parking_notes = COALESCE($3, stop_memory.parking_notes),
      access_difficulty = COALESCE($4, stop_memory.access_difficulty),
      access_notes = COALESCE($5, stop_memory.access_notes),
      requires_walking = COALESCE($6, stop_memory.requires_walking),
      walk_distance_metres = COALESCE($7, stop_memory.walk_distance_metres),
      best_time_of_day = COALESCE($8, stop_memory.best_time_of_day),
      difficulty_after_pm = COALESCE($9, stop_memory.difficulty_after_pm),
      has_flat_entrance = COALESCE($10, stop_memory.has_flat_entrance),
      entrance_location = COALESCE($11, stop_memory.entrance_location),
      gate_code_known = COALESCE($12, stop_memory.gate_code_known),
      avg_completion_time_minutes = $13,
      failure_count = $14,
      success_count = $15,
      last_visited_at = NOW(),
      confidence_score = $16,
      data_sources = $17
  `, [
    normalised,
    input.parkingDifficulty ?? null,
    input.parkingNotes ?? null,
    input.accessDifficulty ?? null,
    input.accessNotes ?? null,
    input.requiresWalking ?? null,
    input.walkDistanceMetres ?? null,
    input.bestTimeOfDay ?? null,
    input.difficultyAfterPm ?? null,
    input.hasFlatEntrance ?? null,
    input.entranceLocation ?? null,
    input.gateCodeKnown ?? null,
    Math.round(newAvgTime),
    newFailures,
    newSuccesses,
    confidenceScore,
    Array.from(sources).join(','),
  ]);
  
  return (await getStopMemory(address))!;
}

/**
 * Get delivery tips for a stop based on memory
 */
export function generateDeliveryTips(memory: StopMemory): string[] {
  const tips: string[] = [];
  
  // Parking tips
  if (memory.parkingDifficulty === 'HARD') {
    tips.push('⚠️ Parking is difficult in this area');
    if (memory.parkingNotes) {
      tips.push(`📍 ${memory.parkingNotes}`);
    }
  } else if (memory.parkingDifficulty === 'EASY') {
    tips.push('✅ Parking is usually straightforward here');
  }
  
  // Access tips
  if (memory.accessDifficulty === 'HARD') {
    tips.push('🚧 Access may be challenging');
    if (memory.accessNotes) {
      tips.push(`🚪 ${memory.accessNotes}`);
    }
  }
  
  // Walking tips
  if (memory.requiresWalking && memory.walkDistanceMetres) {
    tips.push(`🚶 Expect ~${memory.walkDistanceMetres}m walk from parking`);
  }
  
  // Temporal tips
  if (memory.bestTimeOfDay) {
    const timeTips: Record<string, string> = {
      'MORNING': '🌅 Best visited in the morning',
      'MIDDAY': '☀️ Midday deliveries usually go well here',
      'AFTERNOON': '🌤️ Afternoon is the best time for this stop',
      'EVENING': '🌙 Evening deliveries work best here',
    };
    if (timeTips[memory.bestTimeOfDay]) {
      tips.push(timeTips[memory.bestTimeOfDay]);
    }
  }
  
  if (memory.difficultyAfterPm === true) {
    tips.push('⚠️ More difficult after 4pm');
  }
  
  // Entrance tips
  if (memory.entranceLocation) {
    const entranceTips: Record<string, string> = {
      'FRONT': '🚪 Entrance is at the front of the property',
      'REAR': '🚪 Entrance is at the rear - look for side access',
      'SIDE': '🚪 Side entrance - check for alleyway',
    };
    tips.push(entranceTips[memory.entranceLocation] ?? '');
  }
  
  if (memory.gateCodeKnown) {
    tips.push('🔑 Gate code may be needed');
  }
  
  // Success rate tip
  if (memory.successCount !== undefined && memory.failureCount !== undefined) {
    const total = memory.successCount + memory.failureCount;
    if (total >= 3) {
      const rate = memory.successCount / total;
      if (rate >= 0.9) {
        tips.push(`✅ ${memory.successCount}/${total} deliveries successful`);
      } else if (rate < 0.7) {
        tips.push(`⚠️ Only ${memory.successCount}/${total} deliveries successful`);
      }
    }
  }
  
  return tips;
}

/**
 * Batch get memory for multiple addresses
 */
export async function getStopMemoryBatch(
  addresses: string[]
): Promise<Map<string, StopMemory>> {
  const normaliseds = addresses.map(normaliseAddress);
  const placeholders = normaliseds.map((_, i) => `$${i + 1}`).join(', ');
  
  const result = await pool.query(`
    SELECT * FROM stop_memory WHERE address_normalised IN (${placeholders})
  `, normaliseds);
  
  const memoryMap = new Map<string, StopMemory>();
  for (const row of result.rows) {
    const addr = row.address_normalised;
    memoryMap.set(addr, {
      addressNormalised: addr,
      parkingDifficulty: row.parking_difficulty,
      parkingNotes: row.parking_notes,
      accessDifficulty: row.access_difficulty,
      accessNotes: row.access_notes,
      requiresWalking: row.requires_walking,
      walkDistanceMetres: row.walk_distance_metres,
      bestTimeOfDay: row.best_time_of_day,
      difficultyAfterPm: row.difficulty_after_pm,
      hasFlatEntrance: row.has_flat_entrance,
      entranceLocation: row.entrance_location,
      gateCodeKnown: row.gate_code_known,
      avgCompletionTimeMinutes: row.avg_completion_time_minutes,
      failureCount: row.failure_count,
      successCount: row.success_count,
      lastVisitedAt: row.last_visited_at,
      confidenceScore: row.confidence_score,
      dataSources: row.data_sources,
    });
  }
  
  return memoryMap;
}
