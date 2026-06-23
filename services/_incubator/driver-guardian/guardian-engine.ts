/**
 * Driver Guardian Intelligence Engine
 * 
 * Aggregates all intelligence sources into a unified driver protection score.
 * The engine consumes existing services and produces filtered, actionable output.
 * 
 * Design principle: Drivers must not see raw intelligence.
 * Only: what action to take, when to take it, why it matters, fastest/safest option.
 */

import type {
  GuardianInput,
  GuardianRisk,
  RiskSeverity,
  RiskCategory,
  DriverGuardianResult,
  NotificationPriority,
  NotificationDecision,
} from './types';
import { pool } from '../../services/db/index';
import { getStopMemory, type StopMemory } from '../../delivery-learning/stop-memory';
import { getDriverProfile } from '../../delivery-learning/driver-profiles';
import { scoreParkingSpot, type ParkingSpot } from '../../parking-engine/src/index';
import { assessSchoolZoneRisk, type SchoolZone } from '../../traffic-engine/index';
import { getTrafficProfile } from '../../traffic-engine/index';

// ─── Risk Weights ─────────────────────────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<RiskSeverity, number> = {
  LOW: 1,
  MEDIUM: 3,
  HIGH: 7,
  CRITICAL: 10,
};

const CATEGORY_CRITICALITY: Record<RiskCategory, number> = {
  ROAD_CLOSURE: 10,
  FLOODING: 9,
  TIDAL: 8,
  WEATHER: 6,
  SCHOOL_ZONE: 5,
  PARKING: 5,
  ACCESS: 4,
  TRAFFIC: 3,
  ROADWORKS: 3,
  CONGESTION: 2,
  DELIVERY_PROBABILITY: 4,
  DRIVER_FATIGUE: 7,
};

// ─── Main Guardian Function ────────────────────────────────────────────────────

/**
 * Main entry point: Generate comprehensive guardian result for a stop.
 * Combines all intelligence sources into a unified driver protection score.
 */
export async function assessGuardian(
  input: GuardianInput
): Promise<DriverGuardianResult> {
  const risks: GuardianRisk[] = [];
  const dataSources: string[] = [];
  
  // 1. Check stop memory (historical data)
  const stopMemory = await getStopMemoryForStop(input.stopId);
  if (stopMemory) {
    dataSources.push('historical_deliveries');
  }
  
  // 2. Assess parking intelligence
  const parkingRisk = await assessParkingIntelligence(input, stopMemory);
  if (parkingRisk) {
    risks.push(parkingRisk);
    dataSources.push('parking_history');
  }
  
  // 3. Assess school zone risk
  const schoolRisk = await assessSchoolZone(input);
  if (schoolRisk) {
    risks.push(schoolRisk);
    dataSources.push('school_zones');
  }
  
  // 4. Assess traffic risk
  const trafficRisk = await assessTrafficIntelligence(input);
  if (trafficRisk) {
    risks.push(trafficRisk);
    dataSources.push('traffic_data');
  }
  
  // 5. Assess delivery probability
  const deliveryRisk = await assessDeliveryProbability(input, stopMemory);
  if (deliveryRisk) {
    risks.push(deliveryRisk);
    dataSources.push('delivery_outcomes');
  }
  
  // 6. Calculate overall risk score
  const overallRiskScore = calculateOverallRiskScore(risks);
  const overallRiskLevel = scoreToSeverity(overallRiskScore);
  
  // 7. Generate recommendation
  const recommendation = generateRecommendation(risks);
  
  // 8. Determine notification priority
  const notificationPriority = determineNotificationPriority(risks, overallRiskScore);
  const shouldNotifyDriver = notificationPriority !== 'SILENT';
  
  // 9. Calculate confidence and expected benefit
  const confidence = Math.min(0.95, 0.5 + (dataSources.length * 0.1));
  const expectedBenefit = generateExpectedBenefit(risks);
  
  // 10. Set validity window (5 minutes)
  const now = new Date();
  const validUntil = new Date(now.getTime() + 5 * 60 * 1000);
  
  return {
    stopId: input.stopId,
    routeId: input.routeId,
    driverId: input.driverId,
    overallRiskScore,
    overallRiskLevel,
    risks,
    recommendation,
    shouldNotifyDriver,
    notificationPriority,
    confidence,
    dataSources,
    expectedBenefit,
    generatedAt: now,
    validUntil,
  };
}

// ─── Intelligence Assessment Functions ─────────────────────────────────────────

async function getStopMemoryForStop(stopId: string): Promise<StopMemory | null> {
  try {
    const result = await pool.query(`
      SELECT s.address, sm.*
      FROM stops s
      LEFT JOIN stop_memory sm ON sm.address_normalised = LOWER(REGEXP_REPLACE(s.address, '\\s+', ' ', 'g'))
      WHERE s.id = $1
    `, [stopId]);
    
    if (result.rows.length === 0) return null;
    return result.rows[0] as any;
  } catch {
    return null;
  }
}

async function assessParkingIntelligence(
  input: GuardianInput,
  stopMemory: StopMemory | null
): Promise<GuardianRisk | null> {
  const currentHour = input.currentTime.getHours() + input.currentTime.getMinutes() / 60;
  
  // Calculate parking difficulty based on historical data
  let difficultyScore = 50; // Default neutral
  let reason = 'Parking conditions typical for this area';
  let driverAction = 'Find parking as usual';
  
  if (stopMemory) {
    // Use historical data
    const parkingDifficulty = stopMemory.parkingDifficulty;
    const successRate = stopMemory.successCount 
      ? stopMemory.successCount / (stopMemory.successCount + stopMemory.failureCount!) 
      : 0.5;
    
    if (parkingDifficulty === 'HARD' || (parkingDifficulty === 'MODERATE' && successRate < 0.7)) {
      difficultyScore = 70;
      reason = 'Parking has been historically difficult in this area';
      driverAction = 'Consider side street parking';
      
      if (stopMemory.parkingNotes) {
        reason += `: ${stopMemory.parkingNotes}`;
      }
    } else if (parkingDifficulty === 'EASY' || successRate > 0.9) {
      difficultyScore = 20;
      reason = 'Parking typically straightforward';
      driverAction = 'Parking readily available';
    }
  }
  
  // Adjust for time of day
  if (currentHour >= 14 && currentHour <= 16) {
    difficultyScore += 15;
    reason += '. Note: Afternoon school pickup increases congestion.';
  }
  
  if (difficultyScore >= 60) {
    return {
      category: 'PARKING',
      severity: difficultyScore >= 80 ? 'HIGH' : 'MEDIUM',
      confidence: stopMemory ? 0.85 : 0.4,
      score: difficultyScore,
      driverAction,
      reason,
      alternative: 'Side street parking available within 100m',
      expectedImpact: {
        delayMinutes: difficultyScore >= 80 ? 10 : 5,
        failureProbabilityIncrease: difficultyScore >= 80 ? 0.2 : 0.1,
        penaltyRisk: difficultyScore >= 80 ? 'HIGH' : 'MEDIUM',
      },
    };
  }
  
  return null;
}

async function assessSchoolZone(input: GuardianInput): Promise<GuardianRisk | null> {
  // Get current hour
  const currentHour = input.currentTime.getHours() + input.currentTime.getMinutes() / 60;
  
  // Check if in school zone (would query schools table in production)
  // For now, use traffic engine's school zone assessment
  const schools: SchoolZone[] = []; // Would be populated from database
  
  const schoolAssessment = assessSchoolZoneRisk({
    stopLat: input.stopLat,
    stopLng: input.stopLng,
    arrivalHour: currentHour,
    nearbySchools: schools,
  });
  
  if (schoolAssessment.risk !== 'LOW' && schoolAssessment.suggestReschedule) {
    return {
      category: 'SCHOOL_ZONE',
      severity: schoolAssessment.risk,
      confidence: 0.7,
      score: schoolAssessment.risk === 'HIGH' ? 75 : 45,
      driverAction: 'Arrive before school rush if possible',
      reason: schoolAssessment.reason,
      deadline: '15:00',
      expectedImpact: {
        delayMinutes: schoolAssessment.risk === 'HIGH' ? 8 : 3,
        failureProbabilityIncrease: schoolAssessment.risk === 'HIGH' ? 0.15 : 0.05,
      },
    };
  }
  
  return null;
}

async function assessTrafficIntelligence(input: GuardianInput): Promise<GuardianRisk | null> {
  const currentHour = input.currentTime.getHours() + input.currentTime.getMinutes() / 60;
  const trafficProfile = getTrafficProfile(currentHour);
  
  // Only flag if traffic is bad
  if (trafficProfile.congestionMultiplier >= 0.6) {
    const severity: RiskSeverity = 
      trafficProfile.congestionMultiplier >= 0.8 ? 'HIGH' : 'MEDIUM';
    
    return {
      category: 'TRAFFIC',
      severity,
      confidence: 0.75,
      score: Math.round(trafficProfile.congestionMultiplier * 100),
      driverAction: 'Expect delays, allow extra time',
      reason: `${trafficProfile.recommendation} traffic expected`,
      expectedImpact: {
        delayMinutes: Math.round(trafficProfile.congestionMultiplier * 15),
      },
    };
  }
  
  return null;
}

async function assessDeliveryProbability(
  input: GuardianInput,
  stopMemory: StopMemory | null
): Promise<GuardianRisk | null> {
  if (!stopMemory || stopMemory.failureCount === undefined) {
    return null;
  }
  
  const total = stopMemory.successCount + stopMemory.failureCount;
  if (total < 5) return null; // Not enough data
  
  const failureRate = stopMemory.failureCount / total;
  
  // Only flag if failure rate is concerning
  if (failureRate >= 0.2) {
    return {
      category: 'DELIVERY_PROBABILITY',
      severity: failureRate >= 0.4 ? 'HIGH' : 'MEDIUM',
      confidence: Math.min(0.9, total / 20), // More data = higher confidence
      score: Math.round(failureRate * 100),
      driverAction: 'Verify access details before attempting',
      reason: `${stopMemory.failureCount} of ${total} deliveries failed at this location`,
      expectedImpact: {
        failureProbabilityIncrease: failureRate,
      },
    };
  }
  
  return null;
}

// ─── Scoring Functions ────────────────────────────────────────────────────────

function calculateOverallRiskScore(risks: GuardianRisk[]): number {
  if (risks.length === 0) return 10; // Low baseline
  
  let totalScore = 0;
  let maxWeightedScore = 0;
  
  for (const risk of risks) {
    const categoryWeight = CATEGORY_CRITICALITY[risk.category] ?? 1;
    const severityWeight = SEVERITY_WEIGHTS[risk.severity];
    const weightedScore = risk.score * categoryWeight * severityWeight / 10;
    
    totalScore += weightedScore;
    maxWeightedScore += 100 * categoryWeight * severityWeight / 10;
  }
  
  // Normalize to 0-100
  const normalizedScore = Math.min(100, Math.round((totalScore / maxWeightedScore) * 100));
  
  // Add baseline
  return Math.max(5, normalizedScore);
}

function scoreToSeverity(score: number): RiskSeverity {
  if (score < 20) return 'LOW';
  if (score < 50) return 'MEDIUM';
  if (score < 75) return 'HIGH';
  return 'CRITICAL';
}

// ─── Recommendation Functions ──────────────────────────────────────────────────

function generateRecommendation(risks: GuardianRisk[]): string {
  if (risks.length === 0) {
    return 'Proceed to delivery as planned';
  }
  
  // Prioritize by severity
  const sorted = [...risks].sort((a, b) => b.score - a.score);
  const topRisk = sorted[0];
  
  if (topRisk.severity === 'CRITICAL') {
    return `⚠️ ${topRisk.driverAction}`;
  }
  
  if (topRisk.severity === 'HIGH') {
    return topRisk.driverAction;
  }
  
  return 'Standard delivery route';
}

function generateExpectedBenefit(risks: GuardianRisk[]): string {
  if (risks.length === 0) {
    return 'Standard delivery expected';
  }
  
  const totalDelaySaved = risks.reduce(
    (sum, r) => sum + (r.expectedImpact.delayMinutes ?? 0),
    0
  );
  
  if (totalDelaySaved > 10) {
    return `Following guidance could save ${totalDelaySaved} minutes`;
  }
  
  return 'Guidance helps avoid potential issues';
}

// ─── Notification Priority Decision ──────────────────────────────────────────

function determineNotificationPriority(
  risks: GuardianRisk[],
  overallScore: number
): NotificationPriority {
  // Critical or high severity risks require action
  const hasHighSeverity = risks.some(r => r.severity === 'HIGH' || r.severity === 'CRITICAL');
  if (hasHighSeverity || overallScore >= 75) {
    return 'ACTION_REQUIRED';
  }
  
  // Medium severity or moderate overall risk
  const hasMediumSeverity = risks.some(r => r.severity === 'MEDIUM');
  if (hasMediumSeverity || overallScore >= 40) {
    return 'INFORM';
  }
  
  // Low risk - stay silent
  return 'SILENT';
}

/**
 * Make notification decision based on guardian result.
 * This is the filter that determines what the driver sees.
 */
export function makeNotificationDecision(
  result: DriverGuardianResult
): NotificationDecision {
  const topRisk = result.risks[0];
  
  if (result.notificationPriority === 'SILENT') {
    return {
      priority: 'SILENT',
      message: '',
      shouldInterrupt: false,
      confidence: result.confidence,
      explanation: {
        reason: 'Risk level within normal parameters',
        confidence: result.confidence,
        dataSource: result.dataSources.join(', '),
        expectedBenefit: result.expectedBenefit,
      },
    };
  }
  
  if (result.notificationPriority === 'ACTION_REQUIRED') {
    return {
      priority: 'ACTION_REQUIRED',
      message: topRisk?.driverAction ?? result.recommendation,
      icon: '⚠️',
      actionLabel: 'Accept',
      shouldInterrupt: true,
      confidence: result.confidence,
      explanation: {
        reason: topRisk?.reason ?? result.recommendation,
        confidence: result.confidence,
        dataSource: result.dataSources.join(', '),
        expectedBenefit: result.expectedBenefit,
      },
    };
  }
  
  // INFORM priority
  return {
    priority: 'INFORM',
    message: topRisk?.driverAction ?? 'Busy area ahead',
    icon: 'ℹ️',
    shouldInterrupt: false,
    confidence: result.confidence,
    explanation: {
      reason: topRisk?.reason ?? 'Area congestion expected',
      confidence: result.confidence,
      dataSource: result.dataSources.join(', '),
      expectedBenefit: result.expectedBenefit,
    },
  };
}

// ─── Batch Processing ──────────────────────────────────────────────────────────

/**
 * Assess multiple stops for a route.
 * Returns filtered results - only non-silent notifications.
 */
export async function assessRouteGuardian(
  inputs: GuardianInput[]
): Promise<DriverGuardianResult[]> {
  const results = await Promise.all(inputs.map(assessGuardian));
  
  // Filter to only results that need driver notification
  return results.filter(r => r.notificationPriority !== 'SILENT');
}
