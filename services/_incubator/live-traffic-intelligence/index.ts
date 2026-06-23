/**
 * Live Traffic Intelligence Service
 * 
 * Ingests real-time traffic conditions and calculates route impact.
 * Only creates interventions when timeSaved > disruptionCost.
 * 
 * Never directly notifies drivers - feeds into the intelligence pipeline.
 */

export interface TrafficCondition {
  roadId: string;
  roadName?: string;
  location: GeoCoord;
  freeFlowSpeed?: number;      // km/h
  currentSpeed?: number;       // km/h
  congestionLevel: 'none' | 'light' | 'moderate' | 'heavy' | 'blocked';
  delaySeconds?: number;
  lastUpdated: string;
  source: TrafficSource;
}

export type TrafficSource = 'here' | 'tomtom' | 'google' | 'internal';

export interface GeoCoord {
  lat: number;
  lng: number;
}

export interface RouteTrafficImpact {
  routeId: string;
  segmentImpacts: SegmentImpact[];
  totalDelaySeconds: number;
  recommendedAction: 'proceed' | 'reroute' | 'wait';
  reason: string;
  confidence: number;
}

export interface SegmentImpact {
  segmentId: string;
  startLocation: GeoCoord;
  endLocation: GeoCoord;
  trafficCondition: TrafficCondition;
  impactSeconds: number;
  distanceMetres: number;
}

// ─── Decision Thresholds ────────────────────────────────────────────────────────

const TRAFFIC_THRESHOLDS = {
  MIN_DELAY_TO_INTERVENE: 180,        // 3 minutes
  MIN_SPEED_REDUCTION: 0.3,           // 30% speed reduction
  REROUTE_DISRUPTION_COST: 300,        // 5 minutes of disruption
  MIN_TIME_SAVING_TO_REROUTE: 180,     // 3 minutes saved
};

// ─── Main Functions ─────────────────────────────────────────────────────────────

/**
 * Calculate the impact of traffic on a route segment
 */
export function calculateSegmentImpact(
  traffic: TrafficCondition,
  segmentDistanceMetres: number,
  segmentFreeFlowSpeedKmh: number = 50
): number {
  // Calculate expected travel time at free flow
  const freeFlowSeconds = (segmentDistanceMetres / 1000) / segmentFreeFlowSpeedKmh * 3600;
  
  // Calculate current travel time
  const currentSpeedKmh = traffic.currentSpeed || traffic.freeFlowSpeed || segmentFreeFlowSpeedKmh;
  const currentSeconds = (segmentDistanceMetres / 1000) / currentSpeedKmh * 3600;
  
  // Delay is the difference
  const delaySeconds = Math.max(0, currentSeconds - freeFlowSeconds);
  
  // Adjust for congestion level if we don't have current speed
  if (!traffic.currentSpeed) {
    switch (traffic.congestionLevel) {
      case 'blocked':
        return segmentDistanceMetres / 10; // ~36 seconds per 100m = very slow
      case 'heavy':
        return segmentDistanceMetres / 20; // ~18 seconds per 100m
      case 'moderate':
        return segmentDistanceMetres / 40; // ~9 seconds per 100m
      case 'light':
        return segmentDistanceMetres / 80; // ~4.5 seconds per 100m
      default:
        return 0;
    }
  }
  
  return Math.round(delaySeconds);
}

/**
 * Determine if a reroute should be suggested
 */
export function shouldSuggestReroute(
  currentRouteDelaySeconds: number,
  alternativeRouteDelaySeconds: number,
  rerouteDisruptionSeconds: number = 300
): { shouldReroute: boolean; reason: string; timeSavedSeconds: number } {
  const timeSavedSeconds = currentRouteDelaySeconds - alternativeRouteDelaySeconds;
  
  // Reroute is only worth it if:
  // 1. Time saved is significant (MIN_TIME_SAVING_TO_REROUTE)
  // 2. Time saved exceeds the disruption cost of rerouting
  
  if (timeSavedSeconds < TRAFFIC_THRESHOLDS.MIN_TIME_SAVING_TO_REROUTE) {
    return {
      shouldReroute: false,
      reason: `Time saved (${Math.round(timeSavedSeconds / 60)} min) below threshold`,
      timeSavedSeconds,
    };
  }
  
  const netBenefit = timeSavedSeconds - rerouteDisruptionSeconds;
  
  if (netBenefit <= 0) {
    return {
      shouldReroute: false,
      reason: 'Reroute disruption outweighs time savings',
      timeSavedSeconds,
    };
  }
  
  return {
    shouldReroute: true,
    reason: `Reroute saves ${Math.round(netBenefit / 60)} minutes with minimal disruption`,
    timeSavedSeconds: netBenefit,
  };
}

/**
 * Process traffic conditions for a route
 */
export function processRouteTraffic(
  routeId: string,
  trafficConditions: TrafficCondition[],
  routeSegments: RouteSegment[]
): RouteTrafficImpact {
  const segmentImpacts: SegmentImpact[] = [];
  let totalDelaySeconds = 0;
  
  for (const segment of routeSegments) {
    // Find relevant traffic for this segment
    const relevantTraffic = trafficConditions.find(t => 
      isPointNearSegment(t.location, segment)
    );
    
    if (!relevantTraffic) {
      continue;
    }
    
    const impactSeconds = calculateSegmentImpact(
      relevantTraffic,
      segment.distanceMetres,
      segment.freeFlowSpeedKmh
    );
    
    if (impactSeconds >= TRAFFIC_THRESHOLDS.MIN_DELAY_TO_INTERVENE) {
      segmentImpacts.push({
        segmentId: segment.id,
        startLocation: segment.startLocation,
        endLocation: segment.endLocation,
        trafficCondition: relevantTraffic,
        impactSeconds,
        distanceMetres: segment.distanceMetres,
      });
      
      totalDelaySeconds += impactSeconds;
    }
  }
  
  // Determine recommended action
  let recommendedAction: RouteTrafficImpact['recommendedAction'] = 'proceed';
  let reason = 'No significant delays detected';
  
  if (totalDelaySeconds > TRAFFIC_THRESHOLDS.MIN_DELAY_TO_INTERVENE * 2) {
    recommendedAction = 'reroute';
    reason = `Significant delays of ${Math.round(totalDelaySeconds / 60)} minutes detected`;
  } else if (totalDelaySeconds > TRAFFIC_THRESHOLDS.MIN_DELAY_TO_INTERVENE) {
    recommendedAction = 'proceed';
    reason = `Minor delays of ${Math.round(totalDelaySeconds / 60)} minutes - proceed normally`;
  }
  
  return {
    routeId,
    segmentImpacts,
    totalDelaySeconds,
    recommendedAction,
    reason,
    confidence: calculateTrafficConfidence(trafficConditions),
  };
}

export interface RouteSegment {
  id: string;
  startLocation: GeoCoord;
  endLocation: GeoCoord;
  distanceMetres: number;
  freeFlowSpeedKmh?: number;
}

/**
 * Check if a point is near a segment
 */
function isPointNearSegment(point: GeoCoord, segment: RouteSegment): boolean {
  // Simple bounding box check
  const minLat = Math.min(segment.startLocation.lat, segment.endLocation.lat) - 0.01;
  const maxLat = Math.max(segment.startLocation.lat, segment.endLocation.lat) + 0.01;
  const minLng = Math.min(segment.startLocation.lng, segment.endLocation.lng) - 0.01;
  const maxLng = Math.max(segment.startLocation.lng, segment.endLocation.lng) + 0.01;
  
  return (
    point.lat >= minLat &&
    point.lat <= maxLat &&
    point.lng >= minLng &&
    point.lng <= maxLng
  );
}

/**
 * Calculate confidence in traffic data based on source and freshness
 */
function calculateTrafficConfidence(trafficConditions: TrafficCondition[]): number {
  if (trafficConditions.length === 0) {
    return 0;
  }
  
  // Weight by source reliability
  const sourceWeights: Record<TrafficSource, number> = {
    here: 0.95,
    tomtom: 0.90,
    google: 0.85,
    internal: 0.70,
  };
  
  // Weight by data freshness (30 minutes old = 0.5 weight)
  const now = Date.now();
  const maxAgeMs = 30 * 60 * 1000;
  
  let totalWeight = 0;
  let totalConfidence = 0;
  
  for (const traffic of trafficConditions) {
    const ageMs = now - new Date(traffic.lastUpdated).getTime();
    const freshnessWeight = Math.max(0.5, 1 - (ageMs / maxAgeMs));
    
    const sourceWeight = sourceWeights[traffic.source] || 0.7;
    const conditionWeight = freshnessWeight * sourceWeight;
    
    totalWeight += conditionWeight;
    totalConfidence += conditionWeight;
  }
  
  return totalWeight > 0 ? Math.round((totalConfidence / totalWeight) * 100) / 100 : 0;
}

/**
 * Format traffic warning for driver HUD (driver never sees this directly)
 */
export function formatTrafficWarning(impact: RouteTrafficImpact): {
  shouldShow: boolean;
  title: string;
  message: string;
  urgency: 'low' | 'medium' | 'high';
} {
  if (impact.recommendedAction === 'proceed' && impact.totalDelaySeconds < 180) {
    return { shouldShow: false, title: '', message: '', urgency: 'low' };
  }
  
  if (impact.recommendedAction === 'reroute') {
    return {
      shouldShow: true,
      title: '⚠️ Route adjusted',
      message: `Extra ${Math.round(impact.totalDelaySeconds / 60)} minutes on this route`,
      urgency: 'medium',
    };
  }
  
  return {
    shouldShow: true,
    title: '⚠️ Minor delays',
    message: `Allow extra ${Math.round(impact.totalDelaySeconds / 60)} minutes`,
    urgency: 'low',
  };
}

/**
 * Aggregate traffic from multiple sources
 */
export function aggregateTrafficData(
  trafficFromSources: Map<TrafficSource, TrafficCondition[]>
): TrafficCondition[] {
  const aggregated = new Map<string, TrafficCondition>();
  
  // Source priority (higher = more trusted)
  const sourcePriority: Record<TrafficSource, number> = {
    here: 4,
    tomtom: 3,
    google: 2,
    internal: 1,
  };
  
  for (const [source, conditions] of trafficFromSources) {
    for (const condition of conditions) {
      const key = condition.roadId;
      const existing = aggregated.get(key);
      
      if (!existing) {
        aggregated.set(key, condition);
      } else {
        // Prefer higher priority source
        const existingPriority = sourcePriority[existing.source] || 0;
        const newPriority = sourcePriority[source] || 0;
        
        if (newPriority > existingPriority) {
          aggregated.set(key, condition);
        }
      }
    }
  }
  
  return Array.from(aggregated.values());
}
