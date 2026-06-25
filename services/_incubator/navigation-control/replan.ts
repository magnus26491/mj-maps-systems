/**
 * Intelligent Rerouting Engine
 * 
 * Determines when a route change is worth the disruption.
 * Replaces basic rerouting with smart replanning.
 */

import { getProvider, type RouteResult, type NavigationProviderId } from './provider-adapter';

export interface RerouteDecision {
  shouldReroute: boolean;
  reason: string;
  alternativeRoute?: RouteResult;
  delayDifference: number;
  distanceDifference: number;
  disruptionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface RerouteTrigger {
  type: 'TRAFFIC' | 'RESTRICTION' | 'EVENT' | 'ACCIDENT' | 'DRIVER_REQUEST';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedDelaySeconds: number;
  location?: string;
}

// ─── Reroute Threshold Configuration ───────────────────────────────────────────

const REROUTE_THRESHOLDS = {
  MIN_DELAY_SECONDS: 300,
  MAX_ADDITIONAL_DISTANCE: 2000,
  MAX_DISRUPTION: 'HIGH' as const,
  BENEFIT_MULTIPLIER: 1.5,
};

// ─── Main Reroute Decision ─────────────────────────────────────────────────────

export async function shouldReroute(
  currentRoute: RouteResult,
  trigger: RerouteTrigger,
  provider: NavigationProviderId = 'google'
): Promise<RerouteDecision> {
  if (trigger.estimatedDelaySeconds < REROUTE_THRESHOLDS.MIN_DELAY_SECONDS) {
    return {
      shouldReroute: false,
      reason: `Delay of ${Math.round(trigger.estimatedDelaySeconds / 60)} minutes below threshold`,
      delayDifference: 0,
      distanceDifference: 0,
      disruptionLevel: 'LOW',
    };
  }
  
  const providerInstance = getProvider(provider);
  if (!providerInstance) {
    return {
      shouldReroute: false,
      reason: 'Navigation provider not available',
      delayDifference: 0,
      distanceDifference: 0,
      disruptionLevel: 'LOW',
    };
  }
  
  try {
    const alternativeRoute = await providerInstance.reroute(
      {
        fromLat: currentRoute.polyline[0]?.lat ?? 0,
        fromLng: currentRoute.polyline[0]?.lng ?? 0,
        toLat: currentRoute.polyline[currentRoute.polyline.length - 1]?.lat ?? 0,
        toLng: currentRoute.polyline[currentRoute.polyline.length - 1]?.lng ?? 0,
        vehicleId: 'default',
      },
      trigger.location
    );
    
    const delayDifference = trigger.estimatedDelaySeconds - alternativeRoute.trafficDelaysSeconds;
    const distanceDifference = alternativeRoute.totalDistanceMeters - currentRoute.totalDistanceMeters;
    const disruptionLevel = assessDisruption(distanceDifference, delayDifference);
    
    if (distanceDifference > REROUTE_THRESHOLDS.MAX_ADDITIONAL_DISTANCE) {
      return {
        shouldReroute: false,
        reason: `Alternative route adds ${Math.round(distanceDifference / 100) / 10}km - too far`,
        alternativeRoute,
        delayDifference,
        distanceDifference,
        disruptionLevel,
      };
    }
    
    const benefitRatio = delayDifference / Math.max(distanceDifference / 100, 1);
    
    if (benefitRatio < REROUTE_THRESHOLDS.BENEFIT_MULTIPLIER) {
      return {
        shouldReroute: false,
        reason: 'Route change disruption outweighs time savings',
        alternativeRoute,
        delayDifference,
        distanceDifference,
        disruptionLevel,
      };
    }
    
    return {
      shouldReroute: true,
      reason: `Alternative saves ${Math.round(delayDifference / 60)} minutes with minimal detour`,
      alternativeRoute,
      delayDifference,
      distanceDifference,
      disruptionLevel,
    };
    
  } catch {
    return {
      shouldReroute: false,
      reason: 'Failed to calculate alternative route',
      delayDifference: 0,
      distanceDifference: 0,
      disruptionLevel: 'LOW',
    };
  }
}

function assessDisruption(distanceDifference: number, delayDifference: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  const distanceScore = Math.min(100, (distanceDifference / 2000) * 100);
  const delayScore = Math.min(100, (delayDifference / 600) * 100);
  const totalScore = (distanceScore * 0.4) + (delayScore * 0.6);
  
  if (totalScore < 25) return 'LOW';
  if (totalScore < 50) return 'MEDIUM';
  return 'HIGH';
}

export function createTrafficTrigger(delaySeconds: number, location?: string): RerouteTrigger {
  let severity: RerouteTrigger['severity'] = 'LOW';
  if (delaySeconds > 600) severity = 'HIGH';
  else if (delaySeconds > 300) severity = 'MEDIUM';
  
  return { type: 'TRAFFIC', severity, estimatedDelaySeconds: delaySeconds, location };
}

export function createRestrictionTrigger(reason: string, location?: string): RerouteTrigger {
  return { type: 'RESTRICTION', severity: 'HIGH', estimatedDelaySeconds: 600, location };
}

export function formatRerouteDecision(decision: RerouteDecision): {
  shouldShow: boolean;
  title: string;
  message: string;
  action?: string;
} {
  if (!decision.shouldReroute) {
    return { shouldShow: false, title: '', message: '' };
  }
  
  const minutesSaved = Math.round(decision.delayDifference / 60);
  const kmAdded = Math.round(decision.distanceDifference / 100) / 10;
  
  return {
    shouldShow: true,
    title: 'Alternative route available',
    message: `Saves ${minutesSaved} minutes with ${kmAdded}km detour`,
    action: 'Accept route change',
  };
}
