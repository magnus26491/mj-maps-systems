/**
 * Copilot Decision Engine
 * 
 * Creates a single decision pipeline from all existing intelligence.
 * Consumes: Guardian, Prediction, Learning, Confidence, Driver Profile, Vehicle
 */

import type {
  CopilotDecision,
  CopilotAction,
  NotificationLevel,
  CopilotContext,
  StopContext,
  ArrivalBriefing,
  RouteRecommendation,
  DynamicConfidence,
  ConfidenceAdjustment,
  VehicleProfile,
  VehicleRestriction,
} from './types';

// Re-export types
export type { CopilotDecision, CopilotAction, NotificationLevel, CopilotContext, StopContext, ArrivalBriefing };

// ─── Weight Configuration ───────────────────────────────────────────────────────

const DISRUPTION_COSTS = {
  CONTINUE: 0,
  PREPARE_STOP: 1,
  CHANGE_APPROACH: 3,
  REORDER_ROUTE: 5,
  AVOID_ROUTE: 5,
  WAIT: 4,
  ESCALATE: 10,
};

const BENEFIT_THRESHOLD = 2; // netValue must exceed this

// ─── Main Decision Function ─────────────────────────────────────────────────────

/**
 * Generate copilot decision for current context.
 */
export async function generateCopilotDecision(
  context: CopilotContext,
  stopContext: StopContext,
  vehicleProfile: VehicleProfile
): Promise<CopilotDecision> {
  const decisions: CopilotDecision[] = [];
  
  // 1. Check vehicle accessibility
  if (!stopContext.vehicleAccessible) {
    const decision = createVehicleRestrictionDecision(context, stopContext);
    decisions.push(decision);
  }
  
  // 2. Check parking availability
  if (stopContext.parkingDifficulty === 'HARD') {
    const decision = createParkingDecision(context, stopContext);
    decisions.push(decision);
  }
  
  // 3. Check timing risk
  if (stopContext.worstArrivalWindow) {
    const decision = createTimingDecision(context, stopContext);
    if (decision) decisions.push(decision);
  }
  
  // 4. Check environmental factors
  if (stopContext.weatherRisk || stopContext.eventRisk || stopContext.schoolRisk) {
    const decision = createEnvironmentalDecision(context, stopContext);
    if (decision) decisions.push(decision);
  }
  
  // 5. Check route efficiency
  if (context.trafficLevel === 'HIGH' && context.incidentsAhead?.length) {
    const decision = createRouteDecision(context);
    if (decision) decisions.push(decision);
  }
  
  // Select best decision
  const bestDecision = selectBestDecision(decisions);
  
  // If no decisions meet threshold, return CONTINUE
  if (!bestDecision || bestDecision.netValue < BENEFIT_THRESHOLD) {
    return createContinueDecision(context, stopContext);
  }
  
  return bestDecision;
}

function selectBestDecision(decisions: CopilotDecision[]): CopilotDecision | null {
  if (decisions.length === 0) return null;
  
  // Sort by netValue descending
  decisions.sort((a, b) => b.netValue - a.netValue);
  
  return decisions[0];
}

// ─── Decision Creators ─────────────────────────────────────────────────────────

function createVehicleRestrictionDecision(
  context: CopilotContext,
  stop: StopContext
): CopilotDecision {
  const restriction = stop.vehicleRestrictions?.[0];
  
  const decision: CopilotDecision = {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stopId: stop.stopId,
    routeId: context.routeId,
    driverId: context.driverId,
    
    action: 'ESCALATE',
    notificationLevel: 'CRITICAL',
    
    netValue: 10,
    benefit: 10,
    disruptionCost: DISRUPTION_COSTS.ESCALATE,
    
    title: '❌ Vehicle access impossible',
    message: restriction?.reason ?? 'Your vehicle cannot access this location.',
    primaryInstruction: restriction?.distanceFromStop 
      ? `Alternative ${restriction.distanceFromStop}m away` 
      : 'Check alternative access',
    
    confidence: 0.95,
    dataSources: ['vehicle-intelligence', 'bridge-engine', 'access-engine'],
    
    generatedAt: context.currentTime,
    validUntil: new Date(context.currentTime.getTime() + 30 * 60 * 1000),
  };
  
  return decision;
}

function createParkingDecision(
  context: CopilotContext,
  stop: StopContext
): CopilotDecision {
  const alternative = stop.alternativeParking;
  
  const decision: CopilotDecision = {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stopId: stop.stopId,
    routeId: context.routeId,
    driverId: context.driverId,
    
    action: 'CHANGE_APPROACH',
    notificationLevel: 'ACTION',
    
    netValue: alternative ? 6 : 3,
    benefit: alternative ? 8 : 4,
    disruptionCost: alternative ? 2 : 1,
    
    title: '⚠️ Parking may be difficult',
    message: 'Street parking usually limited here.',
    primaryInstruction: alternative 
      ? `Use ${alternative.description}, ${alternative.walkTime}`
      : 'Allow extra time for parking',
    secondaryInstructions: alternative ? [
      `Walk time: ${alternative.walkTime}`,
    ] : undefined,
    
    confidence: stop.parkingConfidence,
    dataSources: ['parking-engine', 'navigation-learning', 'community-intelligence'],
    
    generatedAt: context.currentTime,
    validUntil: new Date(context.currentTime.getTime() + 15 * 60 * 1000),
  };
  
  return decision;
}

function createTimingDecision(
  context: CopilotContext,
  stop: StopContext
): CopilotDecision | null {
  const currentHour = context.currentTime.getHours() + context.currentTime.getMinutes() / 60;
  const worstStart = parseFloat(stop.worstArrivalWindow?.split('-')[0] ?? '0');
  const worstEnd = parseFloat(stop.worstArrivalWindow?.split('-')[1] ?? '0');
  
  // Only alert if we're approaching the worst window
  if (currentHour < worstStart - 0.5 || currentHour > worstEnd + 0.5) {
    return null;
  }
  
  const decision: CopilotDecision = {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stopId: stop.stopId,
    routeId: context.routeId,
    driverId: context.driverId,
    
    action: 'PREPARE_STOP',
    notificationLevel: 'INFORM',
    
    netValue: 4,
    benefit: 5,
    disruptionCost: DISRUPTION_COSTS.PREPARE_STOP,
    
    title: '⏰ Busy time approaching',
    message: `Usually more difficult between ${stop.worstArrivalWindow}.`,
    primaryInstruction: stop.bestArrivalWindow 
      ? `Better time: ${stop.bestArrivalWindow}` 
      : 'Allow extra time',
    
    confidence: 0.75,
    dataSources: ['delivery-prediction', 'stop-memory', 'navigation-learning'],
    
    generatedAt: context.currentTime,
    validUntil: new Date(context.currentTime.getTime() + 30 * 60 * 1000),
  };
  
  return decision;
}

function createEnvironmentalDecision(
  context: CopilotContext,
  stop: StopContext
): CopilotDecision | null {
  const warnings: string[] = [];
  let highestSeverity: NotificationLevel = 'INFORM';
  
  if (stop.weatherRisk) {
    warnings.push(stop.weatherRisk);
    if (highestSeverity === 'INFORM') highestSeverity = 'INFORM';
  }
  
  if (stop.eventRisk) {
    warnings.push(stop.eventRisk);
    highestSeverity = 'ACTION';
  }
  
  if (stop.schoolRisk) {
    warnings.push(stop.schoolRisk);
    highestSeverity = 'ACTION';
  }
  
  const decision: CopilotDecision = {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stopId: stop.stopId,
    routeId: context.routeId,
    driverId: context.driverId,
    
    action: 'PREPARE_STOP',
    notificationLevel: highestSeverity,
    
    netValue: 5,
    benefit: 6,
    disruptionCost: DISRUPTION_COSTS.PREPARE_STOP,
    
    title: highestSeverity === 'ACTION' ? '⚠️ Conditions ahead' : 'ℹ️ Conditions note',
    message: warnings.join('. '),
    primaryInstruction: highestSeverity === 'ACTION' 
      ? 'Allow extra time' 
      : 'Be aware of conditions',
    
    confidence: 0.8,
    dataSources: ['traffic-engine', 'environmental-intelligence', 'guardian'],
    
    generatedAt: context.currentTime,
    validUntil: new Date(context.currentTime.getTime() + 60 * 60 * 1000),
  };
  
  return decision;
}

function createRouteDecision(
  context: CopilotContext
): CopilotDecision | null {
  const incidentCount = context.incidentsAhead?.length ?? 0;
  
  if (incidentCount === 0) return null;
  
  const decision: CopilotDecision = {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stopId: context.nextStopId ?? '',
    routeId: context.routeId,
    driverId: context.driverId,
    
    action: 'AVOID_ROUTE',
    notificationLevel: 'ACTION',
    
    netValue: incidentCount > 1 ? 7 : 4,
    benefit: incidentCount > 1 ? 10 : 6,
    disruptionCost: DISRUPTION_COSTS.AVOID_ROUTE,
    
    title: '⚠️ Route change available',
    message: `${incidentCount} incident${incidentCount > 1 ? 's' : ''} ahead.`,
    primaryInstruction: 'Alternative route saves time',
    
    confidence: 0.85,
    dataSources: ['traffic-engine', 'dynamic-replan', 'route-optimizer'],
    
    generatedAt: context.currentTime,
    validUntil: new Date(context.currentTime.getTime() + 10 * 60 * 1000),
  };
  
  return decision;
}

function createContinueDecision(
  context: CopilotContext,
  stop: StopContext
): CopilotDecision {
  return {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stopId: stop.stopId,
    routeId: context.routeId,
    driverId: context.driverId,
    
    action: 'CONTINUE',
    notificationLevel: 'SILENT',
    
    netValue: 0,
    benefit: 0,
    disruptionCost: 0,
    
    title: 'Ready',
    message: 'No issues detected.',
    primaryInstruction: 'Proceed to next stop',
    
    confidence: stop.parkingConfidence,
    dataSources: ['guardian', 'prediction', 'learning'],
    
    generatedAt: context.currentTime,
    validUntil: new Date(context.currentTime.getTime() + 5 * 60 * 1000),
  };
}

// ─── Arrival Briefing Generator ─────────────────────────────────────────────────

/**
 * Generate arrival briefing for a stop.
 * Maximum 3 items + primary action.
 */
export function generateArrivalBriefing(
  stop: StopContext,
  confidence: DynamicConfidence
): ArrivalBriefing {
  const instructions: string[] = [];
  const warnings: string[] = [];
  
  // 1. Parking instruction
  if (stop.parkingDifficulty !== 'EASY' || stop.alternativeParking) {
    if (stop.alternativeParking) {
      instructions.push(`Park: ${stop.alternativeParking.description}`);
    } else if (stop.parkingDifficulty === 'HARD') {
      instructions.push('Park: Allow extra time');
    }
  }
  
  // 2. Access instruction
  if (stop.recommendedEntrance) {
    instructions.push(`Access: ${stop.recommendedEntrance.toLowerCase()} entrance`);
  }
  
  // 3. Timing instruction
  if (stop.bestArrivalWindow) {
    instructions.push(`Best time: ${stop.bestArrivalWindow}`);
  }
  
  // Warnings (only if critical)
  if (stop.vehicleRestrictions?.length) {
    warnings.push('Vehicle access check required');
  }
  
  if (stop.weatherRisk) {
    warnings.push(stop.weatherRisk);
  }
  
  // Generate trust signal
  let trustSignal: string;
  if (confidence.finalConfidence >= 0.9) {
    trustSignal = 'Known location';
  } else if (confidence.finalConfidence >= 0.7) {
    trustSignal = 'Based on previous deliveries';
  } else {
    trustSignal = 'Limited data available';
  }
  
  return {
    stopId: stop.stopId,
    address: stop.address,
    parkingInstruction: instructions[0],
    accessInstruction: instructions[1],
    timingInstruction: instructions[2],
    warnings: warnings.length > 0 ? warnings : undefined,
    primaryAction: 'START',
    confidence: confidence.finalConfidence,
    trustSignal,
  };
}

// ─── Dynamic Confidence Calculator ─────────────────────────────────────────────

/**
 * Calculate dynamic confidence with external factor adjustments.
 */
export function calculateDynamicConfidence(
  baseConfidence: number,
  stopContext: StopContext,
  context: CopilotContext
): DynamicConfidence {
  const adjustments: ConfidenceAdjustment[] = [];
  
  // Factor: Weather
  if (context.weatherCondition) {
    const weatherCondition = context.weatherCondition.toLowerCase();
    if (weatherCondition.includes('rain') || weatherCondition.includes('wet')) {
      adjustments.push({
        factor: 'WEATHER',
        adjustment: -0.1,
        reason: 'Wet conditions affect parking',
      });
    }
    if (weatherCondition.includes('fog') || weatherCondition.includes('mist')) {
      adjustments.push({
        factor: 'WEATHER',
        adjustment: -0.08,
        reason: 'Reduced visibility',
      });
    }
  }
  
  // Factor: Traffic
  if (context.trafficLevel === 'HIGH') {
    adjustments.push({
      factor: 'TRAFFIC',
      adjustment: -0.1,
      reason: 'Heavy traffic may affect arrival time',
    });
  }
  
  // Factor: Events
  if (stopContext.eventRisk) {
    adjustments.push({
      factor: 'EVENT',
      adjustment: -0.15,
      reason: 'Local event affects conditions',
    });
  }
  
  // Factor: School times
  const hour = context.currentTime.getHours();
  if (hour >= 8 && hour <= 9) {
    adjustments.push({
      factor: 'SCHOOL',
      adjustment: -0.05,
      reason: 'School run traffic',
    });
  }
  if (hour >= 15 && hour <= 16) {
    adjustments.push({
      factor: 'SCHOOL',
      adjustment: -0.08,
      reason: 'School collection traffic',
    });
  }
  
  // Factor: Rush hour
  if (hour >= 17 && hour <= 18) {
    adjustments.push({
      factor: 'TRAFFIC',
      adjustment: -0.12,
      reason: 'Evening rush hour',
    });
  }
  
  // Factor: Historical success
  if (stopContext.previousDeliveries >= 10 && stopContext.successRate >= 0.95) {
    adjustments.push({
      factor: 'HISTORICAL',
      adjustment: 0.1,
      reason: 'Strong delivery history',
    });
  }
  
  // Calculate final confidence
  const totalAdjustment = adjustments.reduce((sum, adj) => sum + adj.adjustment, 0);
  const finalConfidence = Math.max(0.3, Math.min(0.99, baseConfidence + totalAdjustment));
  
  return {
    baseConfidence,
    adjustments,
    finalConfidence,
    adjustmentReasons: adjustments.map(a => a.reason),
  };
}

// ─── Notification Level Converter ───────────────────────────────────────────────

/**
 * Convert decision to notification for driver UI.
 */
export function decisionToNotification(decision: CopilotDecision): {
  show: boolean;
  title: string;
  message: string;
  icon: string;
  action?: string;
} {
  if (decision.notificationLevel === 'SILENT') {
    return {
      show: false,
      title: '',
      message: '',
      icon: '',
    };
  }
  
  const iconMap: Record<NotificationLevel, string> = {
    SILENT: '',
    INFORM: 'ℹ️',
    ACTION: '⚠️',
    CRITICAL: '🚫',
  };
  
  return {
    show: true,
    title: decision.title,
    message: decision.message,
    icon: iconMap[decision.notificationLevel],
    action: decision.primaryInstruction,
  };
}
