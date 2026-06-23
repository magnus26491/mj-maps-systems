/**
 * Navigation Events Service
 * 
 * Abstraction layer for live traffic and event data.
 * Prepares for HERE, TomTom, Google traffic, and council APIs.
 * 
 * This layer receives events and outputs Navigation Impact Scores.
 * The copilot decides what to tell the driver - never directly notify.
 */

export interface NavigationEvent {
  eventId: string;
  type: EventType;
  source: EventSource;
  location: GeoCoord;
  radius?: number;      // meters affected
  startTime?: string;
  endTime?: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  impactScore: number; // 0-100
  affectedVehicleTypes?: string[];
  lastUpdated: string;
  metadata?: Record<string, unknown>;
}

export type EventType = 
  | 'traffic'
  | 'roadwork'
  | 'accident'
  | 'event'
  | 'weather'
  | 'flooding'
  | 'restriction'
  | 'closure';

export type EventSource = 
  | 'here'
  | 'tomtom'
  | 'google'
  | 'council'
  | 'weather_api'
  | 'internal';

export interface GeoCoord {
  lat: number;
  lng: number;
}

export interface NavigationImpactScore {
  overall: number;           // 0-100
  delaySeconds: number;
  distanceMetres: number;
  affectedSegment?: GeoCoord[];
  recommendation: 'proceed' | 'reroute' | 'wait';
  reason: string;
}

// ─── Event Processing ─────────────────────────────────────────────────────────────

/**
 * Calculate impact score for a navigation event
 */
export function calculateImpactScore(event: NavigationEvent): NavigationImpactScore {
  // Base score from severity
  let baseScore = 0;
  switch (event.severity) {
    case 'critical': baseScore = 90; break;
    case 'warning': baseScore = 60; break;
    case 'info': baseScore = 30; break;
  }

  // Adjust based on event type
  const typeMultiplier = getTypeMultiplier(event.type);
  const score = Math.min(100, Math.round(baseScore * typeMultiplier));

  // Calculate estimated delay
  const delaySeconds = estimateDelay(event);

  // Calculate affected distance
  const distanceMetres = event.radius || 500;

  // Determine recommendation
  let recommendation: NavigationImpactScore['recommendation'] = 'proceed';
  if (score >= 80) {
    recommendation = 'reroute';
  } else if (score >= 50 && event.type === 'weather') {
    recommendation = 'wait';
  }

  return {
    overall: score,
    delaySeconds,
    distanceMetres,
    recommendation,
    reason: generateReason(event, score),
  };
}

function getTypeMultiplier(type: EventType): number {
  switch (type) {
    case 'closure': return 1.2;
    case 'accident': return 1.1;
    case 'flooding': return 1.1;
    case 'roadwork': return 0.9;
    case 'traffic': return 0.8;
    case 'event': return 0.7;
    case 'weather': return 0.6;
    case 'restriction': return 1.0;
    default: return 0.5;
  }
}

function estimateDelay(event: NavigationEvent): number {
  // Base delays by type (seconds)
  const baseDelays: Record<EventType, number> = {
    traffic: 300,
    roadwork: 600,
    accident: 900,
    event: 600,
    weather: 300,
    flooding: 600,
    restriction: 120,
    closure: 1200,
  };

  let delay = baseDelays[event.type] || 300;

  // Adjust by severity
  if (event.severity === 'critical') {
    delay *= 1.5;
  } else if (event.severity === 'info') {
    delay *= 0.5;
  }

  // Adjust by radius (larger radius = more impact)
  if (event.radius) {
    const radiusFactor = Math.min(2, Math.max(0.5, event.radius / 1000));
    delay *= radiusFactor;
  }

  return Math.round(delay);
}

function generateReason(event: NavigationEvent, score: number): string {
  if (score >= 80) {
    return `Significant delay expected: ${event.description}`;
  }
  if (score >= 50) {
    return `Moderate impact: ${event.description}`;
  }
  return `Minor impact: ${event.description}`;
}

// ─── Event Aggregation ────────────────────────────────────────────────────────────

/**
 * Aggregate multiple events into a single impact score
 */
export function aggregateEventImpacts(events: NavigationEvent[]): NavigationImpactScore {
  if (events.length === 0) {
    return {
      overall: 0,
      delaySeconds: 0,
      distanceMetres: 0,
      recommendation: 'proceed',
      reason: 'No events on route',
    };
  }

  // Calculate individual impacts
  const impacts = events.map(calculateImpactScore);

  // Weighted average (by severity)
  const totalWeight = events.reduce((sum, e, i) => {
    const weight = e.severity === 'critical' ? 3 : e.severity === 'warning' ? 2 : 1;
    return sum + weight * impacts[i].overall;
  }, 0);
  const totalSeverityWeight = events.reduce((sum, e) => {
    const weight = e.severity === 'critical' ? 3 : e.severity === 'warning' ? 2 : 1;
    return sum + weight;
  }, 0);

  const overall = Math.round(totalWeight / totalSeverityWeight);
  const delaySeconds = Math.max(...impacts.map(i => i.delaySeconds));
  const distanceMetres = Math.max(...impacts.map(i => i.distanceMetres));

  // Determine overall recommendation
  const recommendations = impacts.map(i => i.recommendation);
  let recommendation: NavigationImpactScore['recommendation'] = 'proceed';
  if (recommendations.includes('reroute')) {
    recommendation = 'reroute';
  } else if (recommendations.includes('wait') && overall >= 50) {
    recommendation = 'wait';
  }

  return {
    overall,
    delaySeconds,
    distanceMetres,
    recommendation,
    reason: `${events.length} event(s) affecting route`,
  };
}

// ─── Event Validation ────────────────────────────────────────────────────────────

/**
 * Validate an event before processing
 */
export function validateEvent(event: Partial<NavigationEvent>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!event.type) {
    errors.push('Event type is required');
  }

  if (!event.location) {
    errors.push('Location is required');
  } else {
    if (event.location.lat < -90 || event.location.lat > 90) {
      errors.push('Invalid latitude');
    }
    if (event.location.lng < -180 || event.location.lng > 180) {
      errors.push('Invalid longitude');
    }
  }

  if (!event.severity) {
    errors.push('Severity is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Event Formatting for Copilot ──────────────────────────────────────────────

/**
 * Format event for the delivery copilot (not directly for driver)
 */
export function formatForCopilot(event: NavigationEvent): {
  priority: 'critical' | 'high' | 'medium' | 'low';
  decisionFactors: string[];
  action: 'reroute' | 'warn' | 'ignore';
} {
  const impact = calculateImpactScore(event);

  let priority: 'critical' | 'high' | 'medium' | 'low' = 'low';
  if (impact.overall >= 80) priority = 'critical';
  else if (impact.overall >= 60) priority = 'high';
  else if (impact.overall >= 30) priority = 'medium';

  const decisionFactors: string[] = [];
  
  if (event.affectedVehicleTypes && event.affectedVehicleTypes.length > 0) {
    decisionFactors.push(`Affects: ${event.affectedVehicleTypes.join(', ')}`);
  }
  
  if (event.type === 'weather') {
    decisionFactors.push('Weather conditions may affect delivery');
  }
  
  if (event.type === 'traffic' || event.type === 'accident') {
    decisionFactors.push(`Estimated delay: ${Math.round(event.impactScore / 60)} minutes`);
  }

  let action: 'reroute' | 'warn' | 'ignore' = 'ignore';
  if (impact.recommendation === 'reroute') {
    action = 'reroute';
  } else if (impact.overall >= 40) {
    action = 'warn';
  }

  return {
    priority,
    decisionFactors,
    action,
  };
}
