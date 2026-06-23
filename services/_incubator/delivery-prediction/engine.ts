/**
 * Delivery Prediction Engine
 * 
 * Unified prediction layer using existing intelligence.
 * Answers: "How likely is this delivery to succeed, and what should the driver do?"
 */

import type {
  PredictionRequest,
  DeliveryPrediction,
  PredictionRiskFactor,
  PredictionAction,
  StopDigitalModel,
  DriverSuitability,
  SmartNotification,
  RoutePrediction,
} from './types';
import { pool } from '../../services/db/index';
import { getStopMemory } from '../../delivery-learning/stop-memory';
import { getDriverProfile } from '../../delivery-learning/driver-profiles';
import { assessGuardian } from '../../driver-guardian/guardian-engine';
import { getTrafficProfile } from '../../traffic-engine/index';
import { getCongestionMultiplier } from '../../traffic-engine/index';

// ─── Weight Configuration ───────────────────────────────────────────────────────

const RISK_WEIGHTS = {
  PARKING: 0.25,
  ACCESS: 0.20,
  TRAFFIC: 0.15,
  WEATHER: 0.15,
  CUSTOMER: 0.10,
  TIME: 0.10,
  ROUTE: 0.05,
};

// ─── Main Prediction Function ───────────────────────────────────────────────────

/**
 * Generate delivery prediction for a single stop.
 */
export async function predictDelivery(
  request: PredictionRequest
): Promise<DeliveryPrediction> {
  const { stopId, routeId, driverId, stopLat, stopLng, address, currentTime, estimatedArrivalTime, vehicleId } = request;
  
  const riskFactors: PredictionRiskFactor[] = [];
  let baseProbability = 0.95; // Start with high baseline
  
  // 1. Get stop memory (historical data)
  const stopMemory = await getStopMemory(address);
  
  // 2. Get driver profile
  const driverProfile = await getDriverProfile(driverId);
  
  // 3. Get guardian assessment
  const guardianResult = await assessGuardian({
    stopId,
    routeId,
    driverId,
    stopLat,
    stopLng,
    currentTime,
    estimatedArrivalTime,
    vehicleProfileKey: vehicleId,
  });
  
  // 4. Assess parking risk
  const parkingAssessment = assessParkingRisk(stopMemory, guardianResult);
  if (parkingAssessment.risk) {
    riskFactors.push(parkingAssessment.risk);
    baseProbability += parkingAssessment.risk.impactOnProbability;
  }
  
  // 5. Assess time window risk
  const timeAssessment = assessTimeWindowRisk(stopMemory, estimatedArrivalTime);
  if (timeAssessment.risk) {
    riskFactors.push(timeAssessment.risk);
    baseProbability += timeAssessment.risk.impactOnProbability;
  }
  
  // 6. Assess traffic risk
  const trafficAssessment = assessTrafficRisk(request);
  if (trafficAssessment.risk) {
    riskFactors.push(trafficAssessment.risk);
    baseProbability += trafficAssessment.risk.impactOnProbability;
  }
  
  // 7. Assess driver-suitability risk
  const driverRisk = assessDriverSuitabilityRisk(driverProfile, stopMemory);
  if (driverRisk.risk) {
    riskFactors.push(driverRisk.risk);
    baseProbability += driverRisk.risk.impactOnProbability;
  }
  
  // 8. Calculate final probability
  const completionProbability = Math.max(0.1, Math.min(0.99, baseProbability));
  
  // 9. Calculate failure risk
  const failureRisk = calculateFailureRisk(riskFactors, completionProbability);
  
  // 10. Estimate timing
  const { parkingSeconds, walkingDistance, completionSeconds } = estimateTiming(
    stopMemory,
    parkingAssessment,
    driverProfile
  );
  
  // 11. Generate recommended action
  const recommendedAction = generateAction(riskFactors, failureRisk, guardianResult);
  
  // 12. Calculate confidence
  const confidence = calculateConfidence(stopMemory, driverProfile, riskFactors);
  const dataQuality = getDataQuality(stopMemory, riskFactors);
  
  // 13. Set validity window
  const validUntil = new Date(currentTime.getTime() + 10 * 60 * 1000); // 10 minutes
  
  return {
    stopId,
    routeId,
    driverId,
    completionProbability,
    expectedArrivalTime,
    expectedCompletionSeconds: completionSeconds,
    expectedParkingSeconds: parkingSeconds,
    expectedWalkingDistance: walkingDistance,
    failureRisk,
    riskFactors,
    recommendedAction,
    confidence,
    dataQuality,
    generatedAt: currentTime,
    validUntil,
  };
}

// ─── Risk Assessment Functions ──────────────────────────────────────────────────

function assessParkingRisk(
  stopMemory: any,
  guardianResult: any
): { risk: PredictionRiskFactor | null; parkingSeconds: number } {
  let parkingSeconds = 60; // Default
  
  if (!stopMemory) {
    return { risk: null, parkingSeconds };
  }
  
  const parkingDifficulty = stopMemory.parkingDifficulty ?? 'MODERATE';
  const historicalFailures = stopMemory.failureCount ?? 0;
  
  if (parkingDifficulty === 'HARD' || historicalFailures > 3) {
    parkingSeconds = 180; // 3 minutes average
    return {
      parkingSeconds,
      risk: {
        category: 'PARKING',
        severity: historicalFailures > 5 ? 'HIGH' : 'MEDIUM',
        description: `Parking historically difficult at this location`,
        impactOnProbability: -0.15,
        actionable: true,
        action: 'Consider alternative parking nearby',
      },
    };
  }
  
  if (parkingDifficulty === 'MODERATE') {
    parkingSeconds = 90;
  }
  
  return { risk: null, parkingSeconds };
}

function assessTimeWindowRisk(
  stopMemory: any,
  estimatedArrival: Date
): { risk: PredictionRiskFactor | null } {
  if (!stopMemory?.bestArrivalWindows) {
    return { risk: null };
  }
  
  const arrivalHour = estimatedArrival.getHours();
  const arrivalMinutes = estimatedArrival.getMinutes();
  const arrivalTime = arrivalHour + arrivalMinutes / 60;
  
  // Check if arrival time is in worst window
  const worstWindows = stopMemory.worstArrivalWindows ?? [];
  
  for (const window of worstWindows) {
    const [startH, startM] = window.start.split(':').map(Number);
    const [endH, endM] = window.end.split(':').map(Number);
    const start = startH + startM / 60;
    const end = endH + endM / 60;
    
    if (arrivalTime >= start && arrivalTime <= end) {
      return {
        risk: {
          category: 'TIME',
          severity: 'MEDIUM',
          description: `${window.start}-${window.end} historically challenging at this address`,
          impactOnProbability: -0.10,
          actionable: true,
          action: 'Arrive before ' + window.start + ' if possible',
        },
      };
    }
  }
  
  return { risk: null };
}

function assessTrafficRisk(request: PredictionRequest): { risk: PredictionRiskFactor | null } {
  const { estimatedArrivalTime, trafficData } = request;
  
  const arrivalHour = estimatedArrivalTime.getHours() + estimatedArrivalTime.getMinutes() / 60;
  const congestionMultiplier = getCongestionMultiplier(arrivalHour);
  
  if (congestionMultiplier > 0.7) {
    return {
      risk: {
        category: 'TRAFFIC',
        severity: congestionMultiplier > 0.85 ? 'HIGH' : 'MEDIUM',
        description: 'Heavy traffic expected at arrival time',
        impactOnProbability: -0.08,
        actionable: false,
      },
    };
  }
  
  // Check for incidents
  if (trafficData?.incidents?.length > 0) {
    const severeIncidents = trafficData.incidents.filter((i: any) => 
      i.severity === 'HIGH' || i.severity === 'CRITICAL'
    );
    
    if (severeIncidents.length > 0) {
      return {
        risk: {
          category: 'TRAFFIC',
          severity: 'HIGH',
          description: 'Road incidents detected on route',
          impactOnProbability: -0.12,
          actionable: true,
          action: 'Alternative route may be faster',
        },
      };
    }
  }
  
  return { risk: null };
}

function assessDriverSuitabilityRisk(
  driverProfile: any,
  stopMemory: any
): { risk: PredictionRiskFactor | null } {
  if (!driverProfile) {
    return { risk: null };
  }
  
  // Check if driver is good with high-density areas
  if (stopMemory && stopMemory.parkingDifficulty === 'HARD') {
    if (!driverProfile.handlesHighRisk) {
      return {
        risk: {
          category: 'ROUTE',
          severity: 'LOW',
          description: 'This stop may be challenging based on your profile',
          impactOnProbability: -0.05,
          actionable: false,
        },
      };
    }
  }
  
  return { risk: null };
}

// ─── Timing Estimation ───────────────────────────────────────────────────────────

function estimateTiming(
  stopMemory: any,
  parkingAssessment: { parkingSeconds: number },
  driverProfile: any
): {
  parkingSeconds: number;
  walkingDistance: number;
  completionSeconds: number;
} {
  // Base timing
  let parkingSeconds = parkingAssessment.parkingSeconds;
  let walkingDistance = 50; // metres
  let completionSeconds = 240; // 4 minutes default
  
  if (stopMemory) {
    // Use historical data
    if (stopMemory.avgCompletionTime) {
      completionSeconds = stopMemory.avgCompletionTime * 60;
    }
    if (stopMemory.averageParkingDistanceMetres) {
      walkingDistance = stopMemory.averageParkingDistanceMetres;
    }
  }
  
  // Adjust for driver preferences
  if (driverProfile) {
    if (driverProfile.walkingToleranceMetres) {
      walkingDistance = Math.min(walkingDistance, driverProfile.walkingToleranceMetres);
    }
  }
  
  return { parkingSeconds, walkingDistance, completionSeconds };
}

// ─── Action Generation ───────────────────────────────────────────────────────────

function generateAction(
  riskFactors: PredictionRiskFactor[],
  failureRisk: { score: number; reasons: string[] },
  guardianResult: any
): PredictionAction {
  const highSeverity = riskFactors.filter(r => r.severity === 'HIGH' || r.severity === 'CRITICAL');
  const mediumSeverity = riskFactors.filter(r => r.severity === 'MEDIUM');
  
  if (highSeverity.length > 0) {
    const top = highSeverity[0];
    return {
      type: top.actionable ? 'ALTERNATIVE' : 'WARNING',
      priority: 'ACTION_REQUIRED',
      title: getActionTitle(top.category),
      message: top.action || top.description,
      recommendation: top.action,
    };
  }
  
  if (mediumSeverity.length > 0) {
    const top = mediumSeverity[0];
    return {
      type: 'WARNING',
      priority: 'INFORM',
      title: getActionTitle(top.category),
      message: top.description,
    };
  }
  
  if (guardianResult?.shouldNotifyDriver) {
    return {
      type: 'WARNING',
      priority: 'INFORM',
      title: 'Info',
      message: guardianResult.recommendation,
    };
  }
  
  return {
    type: 'PROCEED',
    priority: 'SILENT',
    title: 'Good to go',
    message: 'Expected to go smoothly',
  };
}

function getActionTitle(category: PredictionRiskFactor['category']): string {
  switch (category) {
    case 'PARKING': return 'Parking may be difficult';
    case 'ACCESS': return 'Access note';
    case 'TRAFFIC': return 'Traffic ahead';
    case 'WEATHER': return 'Weather advisory';
    case 'TIME': return 'Timing note';
    case 'CUSTOMER': return 'Customer info';
    case 'ROUTE': return 'Route info';
    default: return 'Delivery note';
  }
}

// ─── Confidence Calculation ─────────────────────────────────────────────────────

function calculateConfidence(
  stopMemory: any,
  driverProfile: any,
  riskFactors: PredictionRiskFactor[]
): number {
  let confidence = 0.5; // Base
  
  // More historical data = higher confidence
  if (stopMemory?.successCount) {
    confidence += Math.min(0.3, stopMemory.successCount * 0.02);
  }
  
  // More risk factors = lower confidence
  confidence -= riskFactors.length * 0.02;
  
  // Driver profile completeness
  if (driverProfile?.totalDeliveries) {
    confidence += Math.min(0.1, driverProfile.totalDeliveries * 0.001);
  }
  
  return Math.max(0.1, Math.min(0.95, confidence));
}

function getDataQuality(
  stopMemory: any,
  riskFactors: PredictionRiskFactor[]
): 'LOW' | 'MEDIUM' | 'HIGH' {
  const totalSamples = (stopMemory?.successCount ?? 0) + (stopMemory?.failureCount ?? 0);
  
  if (totalSamples >= 20 && riskFactors.length === 0) return 'HIGH';
  if (totalSamples >= 5) return 'MEDIUM';
  return 'LOW';
}

// ─── Failure Risk Calculation ───────────────────────────────────────────────────

function calculateFailureRisk(
  riskFactors: PredictionRiskFactor[],
  completionProbability: number
): { score: number; reasons: string[]; probability: number } {
  const reasons = riskFactors
    .filter(r => r.severity === 'HIGH' || r.severity === 'CRITICAL')
    .map(r => r.description);
  
  const probability = 1 - completionProbability;
  const score = Math.round(probability * 100);
  
  return { score, reasons, probability };
}

// ─── Route Prediction ───────────────────────────────────────────────────────────

/**
 * Generate predictions for an entire route.
 */
export async function predictRoute(
  requests: PredictionRequest[]
): Promise<RoutePrediction> {
  if (requests.length === 0) {
    throw new Error('No stops to predict');
  }
  
  const { routeId, driverId } = requests[0];
  
  // Generate per-stop predictions
  const stopPredictions = await Promise.all(
    requests.map(req => predictDelivery(req))
  );
  
  // Calculate route-level metrics
  const avgProbability = stopPredictions.reduce(
    (sum, p) => sum + p.completionProbability,
    0
  ) / stopPredictions.length;
  
  const totalDuration = stopPredictions.reduce(
    (sum, p) => sum + p.expectedCompletionSeconds + p.expectedParkingSeconds,
    0
  );
  
  const totalDistance = requests.length * 0.5; // Simplified estimate
  
  // Count risk levels
  const highRiskStops = stopPredictions.filter(p => 
    p.riskFactors.some(r => r.severity === 'HIGH' || r.severity === 'CRITICAL')
  ).length;
  
  const mediumRiskStops = stopPredictions.filter(p =>
    p.riskFactors.some(r => r.severity === 'MEDIUM') &&
    !p.riskFactors.some(r => r.severity === 'HIGH' || r.severity === 'CRITICAL')
  ).length;
  
  const lowRiskStops = requests.length - highRiskStops - mediumRiskStops;
  
  // Collect route-level risks
  const routeRisks = stopPredictions
    .flatMap(p => p.riskFactors)
    .filter((r, i, arr) => arr.findIndex(x => x.category === r.category) === i);
  
  return {
    routeId,
    driverId,
    routeCompletionProbability: avgProbability,
    estimatedTotalDurationSeconds: totalDuration,
    estimatedTotalDistanceKm: totalDistance,
    stopPredictions,
    routeRisks,
    highRiskStops,
    mediumRiskStops,
    lowRiskStops,
    generatedAt: new Date(),
  };
}

// ─── Notification Conversion ─────────────────────────────────────────────────────

/**
 * Convert prediction to smart notification for driver UI.
 */
export function toSmartNotification(prediction: DeliveryPrediction): SmartNotification {
  const action = prediction.recommendedAction;
  
  if (action.priority === 'SILENT') {
    return {
      priority: 'SILENT',
      message: '',
      maxDisplaySeconds: 0,
      canDismiss: false,
      requiresAcknowledgment: false,
    };
  }
  
  if (action.priority === 'ACTION_REQUIRED') {
    return {
      priority: 'ACTION_REQUIRED',
      title: action.title,
      message: action.message,
      icon: '⚠️',
      actionLabel: 'View',
      voicePrompt: `${action.title}. ${action.message}`,
      voiceResponses: ['Accept', 'Navigate', 'Ignore'],
      maxDisplaySeconds: 30,
      canDismiss: false,
      requiresAcknowledgment: true,
    };
  }
  
  // INFORM
  return {
    priority: 'INFORM',
    title: action.title,
    message: action.message,
    icon: 'ℹ️',
    voicePrompt: action.message,
    maxDisplaySeconds: 10,
    canDismiss: true,
    requiresAcknowledgment: false,
  };
}
