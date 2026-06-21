/**
 * Event Intelligence Service
 * 
 * Detects and processes events that may affect deliveries:
 * - Festivals
 * - Markets
 * - Concerts
 * - Sporting events
 * - School events
 * - Road closures
 * 
 * Never shows raw event data to drivers. Only surfaces:
 * - What action is required
 * - Why it matters
 * - The safest alternative
 */

export interface Event {
  eventId: string;
  eventType: EventType;
  name?: string;  // Never shown to driver
  location: GeoCoord;
  radius?: number;
  startTime: string;
  endTime: string;
  expectedImpact: 'low' | 'medium' | 'high';
  deliveryImpact: string;  // Human-readable impact description
  recommendation: string;
  source: EventSource;
}

export type EventType = 
  | 'festival'
  | 'market'
  | 'concert'
  | 'sport'
  | 'school'
  | 'road_closure'
  | 'other';

export type EventSource = 'council' | 'internal' | 'traffic_api' | 'weather_api';

export interface GeoCoord {
  lat: number;
  lng: number;
}

export interface DeliveryEventAssessment {
  stopId: string;
  events: Event[];
  arrivalRecommendation: string;
  confidenceAdjustment: number;  // -1 to +1
  warnings: string[];
}

// ─── Event Impact Assessment ─────────────────────────────────────────────────────

const SCHOOL_RISK_TIMES = {
  start: '08:00',
  end: '09:00',
};

const SCHOOL_END_TIMES = {
  start: '15:00',
  end: '16:30',
};

/**
 * Assess events affecting a delivery
 */
export function assessDeliveryEvents(
  stopLocation: GeoCoord,
  scheduledArrival: Date,
  stopAddress?: string
): DeliveryEventAssessment {
  const warnings: string[] = [];
  let confidenceAdjustment = 0;
  let arrivalRecommendation = '';

  // Get current hour
  const hour = scheduledArrival.getHours();
  const minute = scheduledArrival.getMinutes();
  const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

  // Check for school-related congestion
  if (isInTimeRange(timeString, SCHOOL_RISK_TIMES.start, SCHOOL_RISK_TIMES.end) ||
      isInTimeRange(timeString, SCHOOL_END_TIMES.start, SCHOOL_END_TIMES.end)) {
    
    warnings.push('School traffic expected');
    confidenceAdjustment -= 0.15;
    
    if (!arrivalRecommendation) {
      arrivalRecommendation = 'Arrive before school drop-off or after pickup';
    }
  }

  // Check for market events (typically Saturday mornings)
  if (scheduledArrival.getDay() === 6 && hour >= 8 && hour <= 13) {
    warnings.push('Market day - parking may be limited');
    confidenceAdjustment -= 0.1;
    
    if (!arrivalRecommendation) {
      arrivalRecommendation = 'Arrive early or later to avoid market congestion';
    }
  }

  // Check for evening rush (Mon-Fri)
  if (scheduledArrival.getDay() >= 1 && scheduledArrival.getDay() <= 5) {
    if (hour >= 17 && hour <= 19) {
      warnings.push('Evening rush hour traffic');
      confidenceAdjustment -= 0.1;
      
      if (!arrivalRecommendation) {
        arrivalRecommendation = 'Allow extra time for evening traffic';
      }
    }
  }

  // Generate final recommendation
  if (!arrivalRecommendation) {
    arrivalRecommendation = 'No significant events detected';
  }

  return {
    stopId: '',  // Will be filled by caller
    events: [],  // Internal events would go here
    arrivalRecommendation,
    confidenceAdjustment,
    warnings,
  };
}

/**
 * Check if a time is within a range
 */
function isInTimeRange(time: string, start: string, end: string): boolean {
  return time >= start && time <= end;
}

/**
 * Format event warning for driver HUD
 * 
 * NEVER shows:
 * - Event names
 * - Raw data
 * - Unnecessary details
 */
export function formatEventWarning(assessment: DeliveryEventAssessment): {
  shouldShow: boolean;
  title: string;
  message: string;
  urgency: 'low' | 'medium' | 'high';
} {
  if (assessment.warnings.length === 0) {
    return { shouldShow: false, title: '', message: '', urgency: 'low' };
  }

  // Show maximum of 1 warning (most urgent)
  const primaryWarning = assessment.warnings[0];
  
  let urgency: 'low' | 'medium' | 'high' = 'low';
  if (primaryWarning.includes('school') || primaryWarning.includes('congestion')) {
    urgency = 'high';
  } else if (primaryWarning.includes('market') || primaryWarning.includes('rush')) {
    urgency = 'medium';
  }

  // Format message driver-friendly
  let title = '⚠️ Busy area';
  let message = primaryWarning;

  if (primaryWarning.includes('school')) {
    title = '⚠️ School traffic';
    message = 'Allow extra time or arrive before 15:00';
  } else if (primaryWarning.includes('market')) {
    title = '⚠️ Market area';
    message = 'Parking may be limited';
  } else if (primaryWarning.includes('rush')) {
    title = '⚠️ Rush hour';
    message = 'Extra travel time expected';
  }

  return {
    shouldShow: assessment.warnings.length > 0 && assessment.confidenceAdjustment < 0,
    title,
    message,
    urgency,
  };
}

/**
 * Get delivery-friendly event warning
 */
export function getDeliveryWarning(event: Event): string {
  switch (event.eventType) {
    case 'school':
      return 'School nearby - expect traffic during pick-up/drop-off times';
    
    case 'market':
      return 'Market day - parking may be limited';
    
    case 'festival':
      return 'Area may be busy - allow extra time';
    
    case 'concert':
    case 'sport':
      return 'Large event nearby - expect congestion';
    
    case 'road_closure':
      return 'Road closure in area - check alternate routes';
    
    default:
      return 'Area may be busier than usual';
  }
}

/**
 * Calculate confidence adjustment based on events
 */
export function calculateEventConfidenceAdjustment(events: Event[]): number {
  if (events.length === 0) {
    return 0;
  }

  let adjustment = 0;

  for (const event of events) {
    switch (event.expectedImpact) {
      case 'high':
        adjustment -= 0.2;
        break;
      case 'medium':
        adjustment -= 0.1;
        break;
      case 'low':
        adjustment -= 0.05;
        break;
    }
  }

  // Cap adjustment at -0.5
  return Math.max(-0.5, adjustment);
}

/**
 * Get arrival recommendation for events
 */
export function getArrivalRecommendation(events: Event[], scheduledArrival: Date): string {
  if (events.length === 0) {
    return 'Proceed normally';
  }

  // Check for school events
  const schoolEvents = events.filter(e => e.eventType === 'school');
  if (schoolEvents.length > 0) {
    const hour = scheduledArrival.getHours();
    if (hour >= 8 && hour < 9) {
      return 'Arrive before 08:30 if possible';
    }
    if (hour >= 15 && hour < 17) {
      return 'Arrive before 15:00 or after 16:30';
    }
  }

  // Check for market events
  const marketEvents = events.filter(e => e.eventType === 'market');
  if (marketEvents.length > 0) {
    const hour = scheduledArrival.getHours();
    if (hour >= 8 && hour < 12) {
      return 'Arrive before 08:00 or after 13:00';
    }
  }

  // Default
  return 'Allow extra time for congestion';
}
