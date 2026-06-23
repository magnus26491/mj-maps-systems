/**
 * Parking Protection System
 * 
 * Calculates parking penalty risk and suggests alternatives.
 * Prevents drivers from receiving parking fines.
 */

import type { ParkingSpot } from '../../parking-engine/src/index';

export interface ParkingPenaltyRisk {
  stopId: string;
  
  // Parking restrictions
  currentRestriction: {
    type: 'yellow_line' | 'permit' | 'pay_display' | 'loading_bay' | 'free' | 'none';
    maxStayMinutes?: number;
    enforcementLikelihood: 'LOW' | 'MEDIUM' | 'HIGH';
    validUntil?: string;
    paymentRequired?: boolean;
    paymentAmount?: number;
  };
  
  // Delivery duration estimate
  estimatedDeliveryDurationMinutes: number;
  
  // Risk calculation
  overstayRisk: {
    score: number;           // 0-100
    willExceedLimit: boolean;
    excessMinutes?: number;
  };
  
  // Recommendations
  recommendation: string;
  alternatives: Array<{
    type: string;
    distanceMetres: number;
    isLoadingBay: boolean;
    isFree: boolean;
    maxStayMinutes?: number;
    recommendation: string;
  }>;
  
  // Driver action
  driverAdvice: string;
  urgentAction?: 'MOVE_VEHICLE' | 'USE_ALTERNATIVE' | 'PAY_NOW' | null;
}

/**
 * Calculate parking penalty risk for a stop.
 */
export function calculateParkingPenaltyRisk(params: {
  stopId: string;
  parkingSpot: ParkingSpot | null;
  estimatedDeliveryMinutes: number;
  currentTime: Date;
}): ParkingPenaltyRisk {
  const { stopId, parkingSpot, estimatedDeliveryMinutes, currentTime } = params;
  
  // Determine restriction type
  let restriction = {
    type: 'free' as const,
    enforcementLikelihood: 'LOW' as const,
    maxStayMinutes: undefined as number | undefined,
    validUntil: undefined as string | undefined,
    paymentRequired: false,
    paymentAmount: undefined as number | undefined,
  };
  
  if (parkingSpot) {
    switch (parkingSpot.type) {
      case 'loading_bay':
        restriction = {
          type: 'loading_bay',
          enforcementLikelihood: 'MEDIUM',
          maxStayMinutes: parkingSpot.maxStayMins ?? 30,
        };
        break;
        
      case 'yellow_line_timed':
        restriction = {
          type: 'yellow_line',
          enforcementLikelihood: parkingSpot.restrictionStart && parkingSpot.restrictionEnd 
            ? checkTimeInRestriction(currentTime, parkingSpot.restrictionStart, parkingSpot.restrictionEnd)
            : 'MEDIUM',
          maxStayMinutes: parkingSpot.maxStayMins,
          validUntil: parkingSpot.restrictionEnd,
        };
        break;
        
      case 'yellow_line_restricted':
        restriction = {
          type: 'yellow_line',
          enforcementLikelihood: 'HIGH',
          validUntil: parkingSpot.restrictionEnd,
        };
        break;
        
      case 'pay_and_display':
        restriction = {
          type: 'pay_display',
          enforcementLikelihood: 'MEDIUM',
          maxStayMinutes: parkingSpot.maxStayMins ?? 60,
          paymentRequired: true,
          paymentAmount: parkingSpot.maxStayMins ? calculateParkingCost(parkingSpot.maxStayMins) : undefined,
        };
        break;
        
      case 'resident_permit':
        restriction = {
          type: 'permit',
          enforcementLikelihood: 'HIGH',
        };
        break;
        
      case 'free_parking':
      case 'no_stopping':
        restriction = {
          type: parkingSpot.type === 'free_parking' ? 'free' : 'none',
          enforcementLikelihood: 'LOW',
          maxStayMinutes: parkingSpot.maxStayMins,
        };
        break;
    }
  }
  
  // Calculate overstay risk
  const maxStay = restriction.maxStayMinutes ?? 999;
  const willExceedLimit = estimatedDeliveryMinutes > maxStay;
  const excessMinutes = willExceedLimit ? estimatedDeliveryMinutes - maxStay : undefined;
  
  let riskScore = 20; // Baseline
  if (restriction.enforcementLikelihood === 'HIGH') riskScore += 40;
  if (restriction.enforcementLikelihood === 'MEDIUM') riskScore += 20;
  if (willExceedLimit) riskScore += 30;
  if (restriction.paymentRequired && !parkingSpot) riskScore += 15;
  
  riskScore = Math.min(100, riskScore);
  
  // Generate alternatives
  const alternatives: ParkingPenaltyRisk['alternatives'] = [];
  
  if (parkingSpot?.type !== 'loading_bay') {
    alternatives.push({
      type: 'loading_bay',
      distanceMetres: (parkingSpot?.distanceM ?? 0) + 80,
      isLoadingBay: true,
      isFree: true,
      maxStayMinutes: 60,
      recommendation: 'Use loading bay 80m ahead',
    });
  }
  
  alternatives.push({
    type: 'side_street',
    distanceMetres: (parkingSpot?.distanceM ?? 0) + 100,
    isLoadingBay: false,
    isFree: true,
    recommendation: 'Free parking on side street',
  });
  
  // Generate recommendation
  let recommendation = 'Parking available, proceed with delivery';
  let driverAdvice = '';
  let urgentAction: ParkingPenaltyRisk['urgentAction'] = null;
  
  if (riskScore >= 80 || (willExceedLimit && restriction.enforcementLikelihood === 'HIGH')) {
    recommendation = '⚠️ Parking limit may expire before delivery completion';
    driverAdvice = restriction.paymentRequired
      ? 'Payment required. Use loading bay to avoid penalty.'
      : 'Use alternative parking to avoid fine.';
    urgentAction = restriction.paymentRequired ? 'PAY_NOW' : 'USE_ALTERNATIVE';
  } else if (riskScore >= 50 || willExceedLimit) {
    recommendation = 'Parking time limited - delivery may exceed';
    driverAdvice = alternatives[0]?.recommendation ?? 'Consider alternative parking';
    urgentAction = 'USE_ALTERNATIVE';
  } else if (restriction.paymentRequired && !parkingSpot) {
    recommendation = 'Payment parking zone';
    driverAdvice = 'Ensure payment before delivery';
    urgentAction = 'PAY_NOW';
  }
  
  return {
    stopId,
    currentRestriction: restriction,
    estimatedDeliveryDurationMinutes: estimatedDeliveryMinutes,
    overstayRisk: {
      score: riskScore,
      willExceedLimit,
      excessMinutes,
    },
    recommendation,
    alternatives: alternatives.slice(0, 3),
    driverAdvice,
    urgentAction,
  };
}

function checkTimeInRestriction(
  currentTime: Date,
  start: string,
  end: string
): 'LOW' | 'MEDIUM' | 'HIGH' {
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  
  if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
    return 'HIGH';
  }
  
  // Within 30 minutes of restriction window
  if (Math.abs(currentMinutes - startMinutes) < 30 || Math.abs(currentMinutes - endMinutes) < 30) {
    return 'MEDIUM';
  }
  
  return 'LOW';
}

function calculateParkingCost(minutes: number): number {
  // UK average: £1.40 per hour
  return Math.round((minutes / 60) * 1.4 * 100) / 100;
}

/**
 * Get parking advice for HUD display.
 */
export function getParkingAdvice(risk: ParkingPenaltyRisk): {
  showBadge: boolean;
  message: string;
  priority: 'SILENT' | 'INFORM' | 'ACTION_REQUIRED';
} {
  if (risk.overstayRisk.score < 40) {
    return {
      showBadge: false,
      message: '',
      priority: 'SILENT',
    };
  }
  
  if (risk.urgentAction === 'USE_ALTERNATIVE' || risk.urgentAction === 'MOVE_VEHICLE') {
    return {
      showBadge: true,
      message: risk.driverAdvice,
      priority: 'ACTION_REQUIRED',
    };
  }
  
  if (risk.urgentAction === 'PAY_NOW') {
    return {
      showBadge: true,
      message: risk.driverAdvice,
      priority: 'ACTION_REQUIRED',
    };
  }
  
  return {
    showBadge: true,
    message: risk.recommendation,
    priority: 'INFORM',
  };
}
