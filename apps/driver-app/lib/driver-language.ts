/**
 * Driver Language Translation Layer
 * 
 * Converts AI output into human instructions.
 * NEVER expose confidence scores, risk factors, or model probabilities.
 * 
 * All output must be:
 * - Short (readable in <2 seconds)
 * - Actionable
 * - Human-friendly
 */

import type { DriverGuardianResult, GuardianRisk } from '../../services/driver-guardian/types';
import type { DeliveryPrediction, SmartNotification } from '../../services/delivery-prediction/types';

// ─── Parking Risk Translation ──────────────────────────────────────────────────

export interface ParkingTranslation {
  showWarning: boolean;
  title: string;
  message: string;
  recommendation: string;
  alternative?: {
    type: string;
    distance: string;
  };
}

/**
 * Convert parking intelligence to driver-friendly language.
 * 
 * Examples:
 * - parkingDifficultyScore: 82 → "Parking is usually difficult here. Use side road."
 * - historicalFailureRate: 34% → "Use side road."
 */
export function translateParkingRisk(
  prediction: DeliveryPrediction | null,
  guardian: DriverGuardianResult | null
): ParkingTranslation {
  if (!prediction && !guardian) {
    return {
      showWarning: false,
      title: '',
      message: '',
      recommendation: '',
    };
  }
  
  // Find parking risk
  const parkingRisk = guardian?.risks.find(r => r.category === 'PARKING');
  const parkingFactor = prediction?.riskFactors.find(r => r.category === 'PARKING');
  
  if (!parkingRisk && !parkingFactor) {
    return {
      showWarning: false,
      title: '',
      message: '',
      recommendation: '',
    };
  }
  
  // Determine severity and message
  const severity = parkingRisk?.severity ?? parkingFactor?.severity ?? 'LOW';
  
  if (severity === 'LOW' || severity === 'MEDIUM') {
    return {
      showWarning: false,
      title: '',
      message: '',
      recommendation: '',
    };
  }
  
  if (severity === 'HIGH') {
    return {
      showWarning: true,
      title: '⚠️ PARKING',
      message: parkingRisk?.reason ?? 'Street usually busy here.',
      recommendation: 'Use side road.',
      alternative: {
        type: 'side_street',
        distance: '2 min walk',
      },
    };
  }
  
  // CRITICAL
  return {
    showWarning: true,
    title: '⚠️ PARKING RISK',
    message: 'Parking usually difficult here.',
    recommendation: parkingRisk?.alternative ?? 'Loading bay recommended.',
    alternative: {
      type: 'loading_bay',
      distance: '120m ahead',
    },
  };
}

// ─── Access Risk Translation ───────────────────────────────────────────────────

export interface AccessTranslation {
  showWarning: boolean;
  title: string;
  message: string;
  recommendation: string;
}

/**
 * Convert access intelligence to driver-friendly language.
 */
export function translateAccessRisk(
  prediction: DeliveryPrediction | null,
  guardian: DriverGuardianResult | null
): AccessTranslation {
  const accessRisk = guardian?.risks.find(r => r.category === 'ACCESS');
  const accessFactor = prediction?.riskFactors.find(r => r.category === 'ACCESS');
  
  if (!accessRisk && !accessFactor) {
    return {
      showWarning: false,
      title: '',
      message: '',
      recommendation: '',
    };
  }
  
  const severity = accessRisk?.severity ?? accessFactor?.severity ?? 'LOW';
  
  if (severity === 'LOW') {
    return {
      showWarning: false,
      title: '',
      message: '',
      recommendation: '',
    };
  }
  
  // Extract entrance info from reason if available
  const reason = accessRisk?.reason ?? accessFactor?.description ?? '';
  const hasRear = reason.toLowerCase().includes('rear');
  const hasFront = reason.toLowerCase().includes('front');
  
  if (hasRear && !hasFront) {
    return {
      showWarning: severity === 'HIGH',
      title: '⚠️ ACCESS',
      message: 'Rear entrance usually succeeds.',
      recommendation: 'Use rear entrance.',
    };
  }
  
  if (hasFront && !hasRear) {
    return {
      showWarning: severity === 'HIGH',
      title: '⚠️ ACCESS',
      message: 'Front entrance recommended.',
      recommendation: 'Use front door.',
    };
  }
  
  return {
    showWarning: severity === 'HIGH',
    title: '⚠️ ACCESS',
    message: accessRisk?.driverAction ?? 'Check entrance.',
    recommendation: accessRisk?.driverAction ?? 'Ask at reception.',
  };
}

// ─── Traffic Risk Translation ───────────────────────────────────────────────────

export interface TrafficTranslation {
  showWarning: boolean;
  title: string;
  message: string;
  alternative?: {
    timeSaved: string;
    action: string;
  };
}

/**
 * Convert traffic intelligence to driver-friendly language.
 */
export function translateTrafficRisk(
  prediction: DeliveryPrediction | null,
  guardian: DriverGuardianResult | null
): TrafficTranslation {
  const trafficRisk = guardian?.risks.find(r => r.category === 'TRAFFIC');
  const trafficFactor = prediction?.riskFactors.find(r => r.category === 'TRAFFIC');
  
  if (!trafficRisk && !trafficFactor) {
    return {
      showWarning: false,
      title: '',
      message: '',
    };
  }
  
  const severity = trafficRisk?.severity ?? trafficFactor?.severity ?? 'LOW';
  const delay = trafficRisk?.expectedImpact?.delayMinutes ?? trafficFactor?.expectedImpact?.delayMinutes ?? 5;
  
  if (severity === 'LOW') {
    return {
      showWarning: false,
      title: '',
      message: '',
    };
  }
  
  if (severity === 'HIGH' && delay >= 10) {
    return {
      showWarning: true,
      title: '⚠️ ROAD DELAY',
      message: `Accident ahead. ${delay} min delay.`,
      alternative: {
        timeSaved: `${delay} min`,
        action: 'Change route?',
      },
    };
  }
  
  return {
    showWarning: severity === 'HIGH',
    title: '⚠️ TRAFFIC',
    message: delay >= 5 ? `Busy area. ${delay} min delay.` : 'Some traffic ahead.',
  };
}

// ─── Weather Risk Translation ───────────────────────────────────────────────────

export interface WeatherTranslation {
  showWarning: boolean;
  title: string;
  message: string;
  recommendation: string;
}

/**
 * Convert weather intelligence to driver-friendly language.
 */
export function translateWeatherRisk(
  guardian: DriverGuardianResult | null
): WeatherTranslation {
  const weatherRisk = guardian?.risks.find(r => r.category === 'WEATHER');
  
  if (!weatherRisk) {
    return {
      showWarning: false,
      title: '',
      message: '',
      recommendation: '',
    };
  }
  
  const severity = weatherRisk.severity;
  const reason = weatherRisk.reason ?? '';
  
  // Map technical reasons to friendly messages
  if (reason.toLowerCase().includes('rain') || reason.toLowerCase().includes('wet')) {
    return {
      showWarning: severity === 'HIGH',
      title: '⚠️ WEATHER',
      message: 'Wet roads. Drive carefully.',
      recommendation: 'Allow extra time.',
    };
  }
  
  if (reason.toLowerCase().includes('fog') || reason.toLowerCase().includes('mist')) {
    return {
      showWarning: severity === 'HIGH',
      title: '⚠️ WEATHER',
      message: 'Foggy conditions.',
      recommendation: 'Drive slowly.',
    };
  }
  
  if (reason.toLowerCase().includes('ice') || reason.toLowerCase().includes('snow')) {
    return {
      showWarning: severity === 'HIGH',
      title: '⚠️ WEATHER',
      message: 'Icy conditions possible.',
      recommendation: 'Allow extra time.',
    };
  }
  
  return {
    showWarning: severity === 'HIGH',
    title: '⚠️ WEATHER',
    message: reason,
    recommendation: weatherRisk.driverAction ?? 'Check conditions.',
  };
}

// ─── Delivery Risk Translation ─────────────────────────────────────────────────

export interface DeliveryTranslation {
  showWarning: boolean;
  title: string;
  message: string;
  recommendation: string;
}

/**
 * Convert delivery probability to driver-friendly language.
 */
export function translateDeliveryRisk(
  prediction: DeliveryPrediction | null
): DeliveryTranslation {
  if (!prediction) {
    return {
      showWarning: false,
      title: '',
      message: '',
      recommendation: '',
    };
  }
  
  const probability = prediction.completionProbability;
  const dataQuality = prediction.dataQuality;
  
  // Only warn if low probability AND good data
  if (probability >= 0.85 || dataQuality !== 'HIGH') {
    return {
      showWarning: false,
      title: '',
      message: '',
      recommendation: '',
    };
  }
  
  if (probability >= 0.7) {
    return {
      showWarning: false,
      title: '',
      message: '',
      recommendation: '',
    };
  }
  
  // Low probability
  const failureRisk = prediction.failureRisk;
  const topReason = failureRisk?.reasons?.[0] ?? '';
  
  return {
    showWarning: true,
    title: '⚠️ DELIVERY',
    message: 'May need extra time here.',
    recommendation: topReason || 'Verify customer details.',
  };
}

// ─── Unified Warning Translation ────────────────────────────────────────────────

export interface UnifiedWarning {
  priority: 'SILENT' | 'INFO' | 'ACTION_REQUIRED' | 'URGENT';
  category: 'PARKING' | 'ACCESS' | 'TRAFFIC' | 'WEATHER' | 'DELIVERY' | 'ENVIRONMENTAL';
  title: string;
  message: string;
  recommendation: string;
  icon: string;
  showBadge: boolean;
}

/**
 * Convert guardian and prediction to unified warning for HUD.
 */
export function translateUnifiedWarning(
  prediction: DeliveryPrediction | null,
  guardian: DriverGuardianResult | null
): UnifiedWarning | null {
  const warnings: UnifiedWarning[] = [];
  
  // Translate each risk category
  const parking = translateParkingRisk(prediction, guardian);
  if (parking.showWarning) {
    warnings.push({
      priority: parking.title.includes('RISK') ? 'ACTION_REQUIRED' : 'INFO',
      category: 'PARKING',
      title: parking.title,
      message: parking.message,
      recommendation: parking.recommendation,
      icon: '⚠️',
      showBadge: true,
    });
  }
  
  const access = translateAccessRisk(prediction, guardian);
  if (access.showWarning) {
    warnings.push({
      priority: 'ACTION_REQUIRED',
      category: 'ACCESS',
      title: access.title,
      message: access.message,
      recommendation: access.recommendation,
      icon: '⚠️',
      showBadge: true,
    });
  }
  
  const traffic = translateTrafficRisk(prediction, guardian);
  if (traffic.showWarning) {
    warnings.push({
      priority: traffic.alternative ? 'ACTION_REQUIRED' : 'INFO',
      category: 'TRAFFIC',
      title: traffic.title,
      message: traffic.message,
      recommendation: traffic.alternative?.action ?? '',
      icon: '⚠️',
      showBadge: true,
    });
  }
  
  const weather = translateWeatherRisk(guardian);
  if (weather.showWarning) {
    warnings.push({
      priority: 'INFO',
      category: 'WEATHER',
      title: weather.title,
      message: weather.message,
      recommendation: weather.recommendation,
      icon: '🌧️',
      showBadge: true,
    });
  }
  
  // Return highest priority warning only
  const priorityOrder = ['URGENT', 'ACTION_REQUIRED', 'INFO', 'SILENT'];
  warnings.sort((a, b) => 
    priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority)
  );
  
  return warnings[0] ?? null;
}

// ─── Normal Stop Translation ────────────────────────────────────────────────────

/**
 * Generate normal stop message.
 */
export function translateNormalStop(
  prediction: DeliveryPrediction | null
): { title: string; message: string } {
  if (prediction && prediction.completionProbability >= 0.9) {
    return {
      title: 'NEXT DELIVERY',
      message: 'Expected to go smoothly.',
    };
  }
  
  return {
    title: 'NEXT DELIVERY',
    message: '',
  };
}

// ─── Voice Output Translation ───────────────────────────────────────────────────

/**
 * Generate voice-friendly output.
 */
export function toVoiceOutput(warning: UnifiedWarning | null): string {
  if (!warning) {
    return '';
  }
  
  // Short, clear voice instructions
  switch (warning.category) {
    case 'PARKING':
      return `Parking usually difficult here. ${warning.recommendation}`;
    case 'ACCESS':
      return warning.recommendation;
    case 'TRAFFIC':
      return warning.message;
    case 'WEATHER':
      return `${warning.message}. ${warning.recommendation}`;
    default:
      return warning.message;
  }
}
