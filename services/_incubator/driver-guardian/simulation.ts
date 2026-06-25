/**
 * Driver Guardian Simulation
 * 
 * Simulates 100,000 delivery days comparing:
 * - Current MJ Maps (without Guardian)
 * - Phase 17 Guardian-enabled MJ Maps
 * 
 * Measures:
 * - completion rate
 * - failed deliveries
 * - average delivery time
 * - driver interruptions
 * - parking failures
 * - penalty risk
 * - route changes accepted
 * - driver interactions
 */

import type { RiskSeverity } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SimulatedStop {
  id: string;
  lat: number;
  lng: number;
  address: string;
  parkingDifficulty: 'EASY' | 'MODERATE' | 'HARD';
  accessDifficulty: 'EASY' | 'MODERATE' | 'HARD';
  schoolZoneRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  tidalRisk: boolean;
  hasReception: boolean;
  historicalFailureRate: number;
  completionTimeMinutes: number;
}

interface SimulatedRoute {
  id: string;
  stops: SimulatedStop[];
  totalDistanceKm: number;
  estimatedTime: number;
}

interface SimulationConfig {
  numDays: number;
  avgStopsPerDay: number;
  numDrivers: number;
  seed?: number;
}

interface SimulationResult {
  strategy: string;
  totalRoutes: number;
  totalStops: number;
  completedStops: number;
  failedStops: number;
  completionRate: number;
  avgDeliveryTimeMinutes: number;
  driverInterruptions: number;
  parkingFailures: number;
  penaltyRiskEvents: number;
  routeChangesAccepted: number;
  driverInteractions: number;
  avgTimePerStop: number;
}

interface SimulationReport {
  generatedAt: Date;
  config: SimulationConfig;
  currentMJ: SimulationResult;
  guardianMJ: SimulationResult;
  comparison: {
    completionImprovement: number;
    timeSavedMinutes: number;
    interruptionReduction: number;
    penaltyReduction: number;
    winner: string;
  };
  targets: {
    reduceFailedDeliveries: boolean;
    reduceInterruptions: boolean;
    increaseCompletionSpeed: boolean;
    reduceDriverDecisions: boolean;
  };
}

// ─── Random Generator ──────────────────────────────────────────────────────────

class SeededRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  
  pick<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
  
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

// ─── Simulation Generators ────────────────────────────────────────────────────

function generateSimulatedStops(rng: SeededRandom, count: number): SimulatedStop[] {
  const stops: SimulatedStop[] = [];
  
  const parkingDifficulties: Array<'EASY' | 'MODERATE' | 'HARD'> = ['EASY', 'MODERATE', 'HARD'];
  const accessDifficulties: Array<'EASY' | 'MODERATE' | 'HARD'> = ['EASY', 'MODERATE', 'HARD'];
  const schoolRisks: Array<'LOW' | 'MEDIUM' | 'HIGH'> = ['LOW', 'MEDIUM', 'HIGH'];
  
  for (let i = 0; i < count; i++) {
    const parking = rng.pick(parkingDifficulties);
    const access = rng.pick(accessDifficulties);
    const schoolRisk = rng.pick(schoolRisks);
    
    // Historical failure rate based on difficulty
    let failureRate = 0.05;
    if (parking === 'HARD') failureRate += 0.15;
    if (access === 'HARD') failureRate += 0.10;
    if (schoolRisk === 'HIGH') failureRate += 0.05;
    failureRate = Math.min(0.5, failureRate);
    
    // Completion time based on difficulty
    let completionTime = 4;
    if (parking === 'HARD') completionTime += rng.nextInt(2, 8);
    if (access === 'HARD') completionTime += rng.nextInt(1, 4);
    completionTime += rng.nextInt(1, 3);
    
    stops.push({
      id: `sim-stop-${i}`,
      lat: 51.5074 + (rng.next() - 0.5) * 0.2,
      lng: -0.1278 + (rng.next() - 0.5) * 0.3,
      address: `Simulated Address ${i}`,
      parkingDifficulty: parking,
      accessDifficulty: access,
      schoolZoneRisk: schoolRisk,
      tidalRisk: rng.chance(0.02), // 2% tidal risk
      hasReception: rng.chance(0.3),
      historicalFailureRate: failureRate,
      completionTimeMinutes: completionTime,
    });
  }
  
  return stops;
}

// ─── Simulation: Current MJ Maps ───────────────────────────────────────────────

function simulateCurrentMJ(
  stops: SimulatedStop[],
  rng: SeededRandom
): { completed: number; failed: number; totalTime: number; interruptions: number; penalties: number } {
  let completed = 0;
  let failed = 0;
  let totalTime = 0;
  let interruptions = 0;
  let penalties = 0;
  
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    
    // Baseline delivery (no guardian guidance)
    let successProb = 1 - stop.historicalFailureRate;
    
    // Fatigue factor
    const fatigueMultiplier = 1 + (i / stops.length) * 0.3;
    
    // Traffic delay
    const trafficDelay = rng.chance(0.2) ? rng.nextInt(2, 8) : 0;
    
    // Parking difficulty adds time
    const parkingTime = stop.parkingDifficulty === 'HARD' ? rng.nextInt(3, 10) : 0;
    
    // Calculate success
    const adjustedProb = successProb / fatigueMultiplier;
    
    if (rng.chance(adjustedProb)) {
      completed++;
      totalTime += (stop.completionTimeMinutes + trafficDelay + parkingTime) * fatigueMultiplier;
    } else {
      failed++;
      totalTime += 5 * fatigueMultiplier; // Time to note failure
      interruptions++; // Driver has to decide what to do
    }
    
    // Random interruptions (driver asks for help, no guardian guidance)
    if (rng.chance(0.05)) {
      interruptions++;
    }
    
    // Parking penalty risk (no protection)
    if (stop.parkingDifficulty === 'HARD' && rng.chance(0.1)) {
      penalties++;
    }
  }
  
  return { completed, failed, totalTime, interruptions, penalties };
}

// ─── Simulation: Guardian MJ Maps ─────────────────────────────────────────────

function simulateGuardianMJ(
  stops: SimulatedStop[],
  rng: SeededRandom
): { completed: number; failed: number; totalTime: number; interruptions: number; penalties: number; routeChanges: number } {
  let completed = 0;
  let failed = 0;
  let totalTime = 0;
  let interruptions = 0;
  let penalties = 0;
  let routeChanges = 0;
  
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    
    // Guardian provides guidance
    let successProb = 1 - stop.historicalFailureRate;
    
    // Guardian improves success rate by helping with:
    // - Parking (reduce parking time by suggesting alternatives)
    // - Access (suggest best entrance)
    // - Timing (avoid school zones, tidal roads)
    
    if (stop.parkingDifficulty === 'HARD') {
      // Guardian suggests alternative parking - 10% improvement
      successProb += 0.10;
    }
    
    if (stop.accessDifficulty === 'HARD' && stop.hasReception) {
      // Guardian suggests rear entrance - 15% improvement
      successProb += 0.15;
    }
    
    if (stop.schoolZoneRisk === 'HIGH') {
      // Guardian warns about school - driver can reschedule or skip
      if (rng.chance(0.3)) {
        // Skip this stop, move to next
        routeChanges++;
        continue;
      }
      // Otherwise, reduced delay
      successProb += 0.05;
    }
    
    // Fatigue factor (reduced with guardian breaks)
    const fatigueMultiplier = 1 + (i / stops.length) * 0.15; // 50% less fatigue
    
    // Traffic delay (guardian finds alternative routes)
    const trafficDelay = rng.chance(0.1) ? rng.nextInt(1, 4) : 0;
    
    // Parking time (guardian suggests best spot)
    const parkingTime = stop.parkingDifficulty === 'HARD' ? rng.nextInt(1, 4) : 0;
    
    // Guardian only interrupts for critical issues
    if (stop.tidalRisk || stop.schoolZoneRisk === 'HIGH') {
      // Guardian alerts driver
      if (rng.chance(0.8)) { // 80% accept guidance
        interruptions++;
      }
    }
    
    // Calculate success
    const adjustedProb = Math.min(0.99, successProb / fatigueMultiplier);
    
    if (rng.chance(adjustedProb)) {
      completed++;
      totalTime += (stop.completionTimeMinutes + trafficDelay + parkingTime) * fatigueMultiplier;
    } else {
      failed++;
      totalTime += 3 * fatigueMultiplier; // Faster failure with guidance
      interruptions++; // But guardian helps decide next action
    }
    
    // Parking penalty protection
    if (stop.parkingDifficulty === 'HARD') {
      // Guardian warns and suggests alternatives - 70% reduction in penalties
      if (rng.chance(0.03)) {
        penalties++;
      }
    }
  }
  
  return { completed, failed, totalTime, interruptions, penalties, routeChanges };
}

// ─── Main Simulation ─────────────────────────────────────────────────────────

export async function runGuardianSimulation(
  config: SimulationConfig
): Promise<SimulationReport> {
  const rng = new SeededRandom(config.seed ?? Date.now());
  
  const currentResults = {
    totalRoutes: 0,
    totalStops: 0,
    completedStops: 0,
    failedStops: 0,
    totalDeliveryTime: 0,
    driverInterruptions: 0,
    parkingFailures: 0,
    penaltyRiskEvents: 0,
    routeChangesAccepted: 0,
    driverInteractions: 0,
  };
  
  const guardianResults = {
    totalRoutes: 0,
    totalStops: 0,
    completedStops: 0,
    failedStops: 0,
    totalDeliveryTime: 0,
    driverInterruptions: 0,
    parkingFailures: 0,
    penaltyRiskEvents: 0,
    routeChangesAccepted: 0,
    driverInteractions: 0,
  };
  
  // Simulate each day
  for (let day = 0; day < config.numDays; day++) {
    // Generate stops for this day
    const stops = generateSimulatedStops(rng, config.avgStopsPerDay);
    
    // Run both strategies
    const current = simulateCurrentMJ(stops, rng);
    const guardian = simulateGuardianMJ(stops, rng);
    
    // Aggregate results
    currentResults.totalRoutes++;
    currentResults.totalStops += stops.length;
    currentResults.completedStops += current.completed;
    currentResults.failedStops += current.failed;
    currentResults.totalDeliveryTime += current.totalTime;
    currentResults.driverInterruptions += current.interruptions;
    currentResults.penaltyRiskEvents += current.penalties;
    
    guardianResults.totalRoutes++;
    guardianResults.totalStops += stops.length;
    guardianResults.completedStops += guardian.completed;
    guardianResults.failedStops += guardian.failed;
    guardianResults.totalDeliveryTime += guardian.totalTime;
    guardianResults.driverInterruptions += guardian.interruptions;
    guardianResults.parkingFailures += guardian.penalties;
    guardianResults.routeChangesAccepted += guardian.routeChanges;
  }
  
  // Calculate final metrics
  const formatResult = (r: typeof currentResults): SimulationResult => ({
    strategy: 'MJ Maps',
    totalRoutes: r.totalRoutes,
    totalStops: r.totalStops,
    completedStops: r.completedStops,
    failedStops: r.failedStops,
    completionRate: Math.round((r.completedStops / r.totalStops) * 1000) / 10,
    avgDeliveryTimeMinutes: Math.round((r.totalDeliveryTime / r.totalStops) * 10) / 10,
    driverInterruptions: r.driverInterruptions,
    parkingFailures: r.parkingFailures,
    penaltyRiskEvents: r.penaltyRiskEvents,
    routeChangesAccepted: r.routeChangesAccepted,
    driverInteractions: r.driverInterruptions + r.routeChangesAccepted,
    avgTimePerStop: Math.round((r.totalDeliveryTime / r.totalStops) * 10) / 10,
  });
  
  const currentMJ = formatResult(currentResults);
  const guardianMJ = {
    ...formatResult(guardianResults),
    strategy: 'Guardian MJ Maps',
  };
  
  // Calculate comparison
  const completionImprovement = guardianMJ.completionRate - currentMJ.completionRate;
  const timeSavedMinutes = currentMJ.avgDeliveryTimeMinutes - guardianMJ.avgDeliveryTimeMinutes;
  const interruptionReduction = currentMJ.driverInterruptions - guardianMJ.driverInterruptions;
  const penaltyReduction = ((currentMJ.penaltyRiskEvents - guardianMJ.penaltyRiskEvents) / Math.max(currentMJ.penaltyRiskEvents, 1)) * 100;
  
  // Determine winner
  const winner = completionImprovement > 0 && interruptionReduction > 0 ? 'guardian' : 'current';
  
  return {
    generatedAt: new Date(),
    config,
    currentMJ,
    guardianMJ,
    comparison: {
      completionImprovement: Math.round(completionImprovement * 10) / 10,
      timeSavedMinutes: Math.round(timeSavedMinutes * 10) / 10,
      interruptionReduction,
      penaltyReduction: Math.round(penaltyReduction * 10) / 10,
      winner,
    },
    targets: {
      reduceFailedDeliveries: guardianMJ.failedStops < currentMJ.failedStops,
      reduceInterruptions: guardianMJ.driverInterruptions < currentMJ.driverInterruptions,
      increaseCompletionSpeed: timeSavedMinutes > 0,
      reduceDriverDecisions: (guardianMJ.driverInteractions) < (currentMJ.driverInterruptions),
    },
  };
}

/**
 * Run quick simulation for testing
 */
export function runQuickGuardianSimulation(): SimulationReport {
  return runGuardianSimulation({
    numDays: 100000,
    avgStopsPerDay: 30,
    numDrivers: 100,
    seed: 42,
  }) as any;
}
