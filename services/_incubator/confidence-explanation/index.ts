/**
 * Confidence Explanation Service
 * 
 * Transforms raw confidence scores into human-understandable trust signals.
 * Never shows percentages. Shows reasons.
 */

export interface ConfidenceExplanation {
  // Raw score
  confidence: number;
  
  // Human-readable summary
  summary: 'VERY_LIKELY' | 'LIKELY' | 'POSSIBLE' | 'UNCERTAIN';
  
  // Positive reasons
  positiveReasons: string[];
  
  // Warnings
  warnings: string[];
  
  // Action
  action: string;
}

export interface ConfidenceFactor {
  factor: string;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  weight: number;
  reason: string;
}

// ─── Summary Generators ───────────────────────────────────────────────────────────

function generateSummary(confidence: number): ConfidenceExplanation['summary'] {
  if (confidence >= 0.85) return 'VERY_LIKELY';
  if (confidence >= 0.7) return 'LIKELY';
  if (confidence >= 0.5) return 'POSSIBLE';
  return 'UNCERTAIN';
}

function generateSummaryText(summary: ConfidenceExplanation['summary']): string {
  switch (summary) {
    case 'VERY_LIKELY':
      return 'Very likely to complete';
    case 'LIKELY':
      return 'Likely to complete';
    case 'POSSIBLE':
      return 'May have challenges';
    case 'UNCERTAIN':
      return 'Limited information';
  }
}

function generateAction(summary: ConfidenceExplanation['summary']): string {
  switch (summary) {
    case 'VERY_LIKELY':
      return 'Continue normally';
    case 'LIKELY':
      return 'Proceed with awareness';
    case 'POSSIBLE':
      return 'Allow extra time';
    case 'UNCERTAIN':
      return 'Be prepared';
  }
}

// ─── Main Explanation Generator ──────────────────────────────────────────────────

/**
 * Generate human-readable confidence explanation.
 */
export function generateConfidenceExplanation(
  confidence: number,
  positiveFactors: string[],
  negativeFactors: string[],
  warnings: string[] = []
): ConfidenceExplanation {
  const summary = generateSummary(confidence);
  
  // Format positive reasons
  const positiveReasons = positiveFactors.map(f => formatPositiveReason(f));
  
  // Format warnings
  const formattedWarnings = warnings.map(w => formatWarning(w));
  
  return {
    confidence,
    summary,
    positiveReasons,
    warnings: formattedWarnings,
    action: generateAction(summary),
  };
}

/**
 * Format a positive reason for display.
 */
function formatPositiveReason(factor: string): string {
  // Check for common patterns and format nicely
  if (factor.includes('delivered') || factor.includes('delivery')) {
    return `✓ ${capitalizeFirst(factor)}`;
  }
  if (factor.includes('vehicle') && factor.includes('compatible')) {
    return '✓ Vehicle compatible';
  }
  if (factor.includes('parking') && factor.includes('available')) {
    return '✓ Parking normally available';
  }
  if (factor.includes('access')) {
    return '✓ Access historically clear';
  }
  if (factor.includes('no problem')) {
    return '✓ No previous issues';
  }
  
  return `✓ ${capitalizeFirst(factor)}`;
}

/**
 * Format a warning for display.
 */
function formatWarning(warning: string): string {
  // Check for common patterns
  if (warning.includes('traffic') && warning.includes('15:00')) {
    return '⚠️ School traffic expected 15:00-16:00';
  }
  if (warning.includes('traffic') && warning.includes('17:00')) {
    return '⚠️ Evening rush hour traffic';
  }
  if (warning.includes('parking')) {
    return `⚠️ ${capitalizeFirst(warning)}`;
  }
  if (warning.includes('event') || warning.includes('festival')) {
    return `⚠️ Local event may affect access`;
  }
  if (warning.includes('weather') || warning.includes('rain')) {
    return `⚠️ Wet conditions expected`;
  }
  if (warning.includes('school')) {
    return `⚠️ School hours may affect timing`;
  }
  
  return `⚠️ ${capitalizeFirst(warning)}`;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Specific Explanation Generators ──────────────────────────────────────────

/**
 * Generate explanation for parking confidence.
 */
export function explainParkingConfidence(
  confidence: number,
  parkingHistory: {
    timesParked: number;
    avgWalkDistance: number;
    problems: number;
  },
  currentConditions: {
    timeOfDay: string;
    dayOfWeek: string;
    weatherRisk?: string;
  }
): ConfidenceExplanation {
  const positiveFactors: string[] = [];
  const warnings: string[] = [];
  
  // Parking history
  if (parkingHistory.timesParked >= 10) {
    positiveFactors.push(`Parked here ${parkingHistory.timesParked} times`);
  }
  if (parkingHistory.problems === 0) {
    positiveFactors.push('No parking problems recorded');
  }
  if (parkingHistory.avgWalkDistance <= 50) {
    positiveFactors.push('Usually parks nearby');
  }
  
  // Time conditions
  if (currentConditions.timeOfDay.includes('morning')) {
    positiveFactors.push('Morning parking usually available');
  }
  
  // Weather
  if (currentConditions.weatherRisk) {
    warnings.push(currentConditions.weatherRisk);
  }
  
  return generateConfidenceExplanation(confidence, positiveFactors, [], warnings);
}

/**
 * Generate explanation for access confidence.
 */
export function explainAccessConfidence(
  confidence: number,
  accessHistory: {
    timesAccessed: number;
    successRate: number;
    preferredEntrance?: string;
  },
  currentConditions: {
    vehicleType: string;
    entranceOptions?: string[];
  }
): ConfidenceExplanation {
  const positiveFactors: string[] = [];
  const warnings: string[] = [];
  
  // Access history
  if (accessHistory.timesAccessed >= 5) {
    positiveFactors.push(`Accessed ${accessHistory.timesAccessed} times`);
  }
  if (accessHistory.successRate >= 0.95) {
    positiveFactors.push('Access consistently successful');
  }
  if (accessHistory.preferredEntrance) {
    positiveFactors.push(`${accessHistory.preferredEntrance} entrance normally works`);
  }
  
  // Vehicle considerations
  if (currentConditions.vehicleType.includes('large') || currentConditions.vehicleType.includes('rigid')) {
    if (accessHistory.successRate >= 0.9) {
      positiveFactors.push('Large vehicle access proven');
    } else {
      warnings.push('Large vehicles may have access limitations');
    }
  }
  
  return generateConfidenceExplanation(confidence, positiveFactors, [], warnings);
}

/**
 * Generate explanation for delivery success.
 */
export function explainDeliveryConfidence(
  confidence: number,
  stopContext: {
    successfulDeliveries: number;
    avgCompletionTime: number;
    recentDeliveries: number;
  },
  vehicleContext: {
    vehicleId: string;
    familiarVehicle: boolean;
  },
  environmentalContext: {
    trafficLevel: string;
    weatherRisk?: string;
    eventRisk?: string;
  }
): ConfidenceExplanation {
  const positiveFactors: string[] = [];
  const warnings: string[] = [];
  
  // Delivery history
  if (stopContext.successfulDeliveries >= 10) {
    positiveFactors.push(`Delivered here ${stopContext.successfulDeliveries} times`);
  }
  if (stopContext.recentDeliveries > 0) {
    positiveFactors.push(`Last delivery recently`);
  }
  
  // Vehicle
  if (vehicleContext.familiarVehicle) {
    positiveFactors.push('Same vehicle type as before');
  }
  
  // Environmental
  if (environmentalContext.trafficLevel === 'low') {
    positiveFactors.push('Traffic conditions good');
  } else if (environmentalContext.trafficLevel === 'high') {
    warnings.push('Heavy traffic expected');
  }
  
  if (environmentalContext.weatherRisk) {
    warnings.push(environmentalContext.weatherRisk);
  }
  
  if (environmentalContext.eventRisk) {
    warnings.push(environmentalContext.eventRisk);
  }
  
  return generateConfidenceExplanation(confidence, positiveFactors, [], warnings);
}

// ─── Quick Explanation ─────────────────────────────────────────────────────────

/**
 * Quick explanation for HUD display.
 */
export function quickExplanation(confidence: number, hasWarnings: boolean): {
  summary: string;
  checkmarks: number;
  warnings: number;
} {
  const summary = generateSummaryText(generateSummary(confidence));
  
  let checkmarks = 0;
  if (confidence >= 0.9) checkmarks = 3;
  else if (confidence >= 0.75) checkmarks = 2;
  else if (confidence >= 0.5) checkmarks = 1;
  
  const warnings = hasWarnings ? 1 : 0;
  
  return { summary, checkmarks, warnings };
}
