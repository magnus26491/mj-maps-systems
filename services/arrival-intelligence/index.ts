/**
 * Arrival Intelligence Service
 * 
 * Predicts what happens in the final 200 metres.
 * Inputs:
 * - Parking intelligence
 * - Building memory
 * - Stop features
 * - Delivery history
 * - Community reports
 * 
 * Output:
 * - arrivalInstruction: Human-friendly instruction for final approach
 */

import type { StopMemory } from '../../delivery-learning/stop-memory';

export interface ArrivalInstruction {
  stopId: string;
  
  // Parking instruction
  parking: {
    instruction: string;
    location: string;
    walkDistance: string;
    alternative?: string;
  };
  
  // Access instruction
  access: {
    entrance: 'FRONT' | 'REAR' | 'SIDE' | 'UNKNOWN';
    instruction: string;
    notes?: string;
  };
  
  // Building info
  building: {
    type: 'HOUSE' | 'FLAT' | 'COMMERCIAL' | 'MIXED' | 'UNKNOWN';
    floor?: string;
    reception?: string;
    intercom?: boolean;
  };
  
  // Customer info
  customer?: {
    typicallyPresent: boolean;
    avgResponseSeconds?: number;
    instructions?: string;
  };
  
  // Confidence
  confidence: number;
  dataQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // Single instruction for voice/HUD
  primaryInstruction: string;
  secondaryInstructions: string[];
}

/**
 * Generate arrival instruction for a stop.
 */
export async function generateArrivalInstruction(
  stopId: string,
  address: string,
  stopMemory: StopMemory | null
): Promise<ArrivalInstruction> {
  // Generate parking instruction
  const parking = generateParkingInstruction(stopMemory);
  
  // Generate access instruction
  const access = generateAccessInstruction(stopMemory);
  
  // Generate building info
  const building = generateBuildingInfo(stopMemory);
  
  // Generate customer info
  const customer = generateCustomerInfo(stopMemory);
  
  // Calculate confidence
  const confidence = calculateConfidence(stopMemory);
  const dataQuality = getDataQuality(stopMemory);
  
  // Build primary instruction
  const primaryInstruction = buildPrimaryInstruction(parking, access);
  
  // Build secondary instructions
  const secondaryInstructions = buildSecondaryInstructions(
    parking,
    access,
    building,
    customer
  );
  
  return {
    stopId,
    parking,
    access,
    building,
    customer,
    confidence,
    dataQuality,
    primaryInstruction,
    secondaryInstructions,
  };
}

function generateParkingInstruction(
  memory: StopMemory | null
): ArrivalInstruction['parking'] {
  if (!memory) {
    return {
      instruction: 'Find nearest parking.',
      location: 'On street',
      walkDistance: 'Short walk',
    };
  }
  
  const parkingDifficulty = memory.parkingDifficulty ?? 'MODERATE';
  
  if (parkingDifficulty === 'EASY') {
    return {
      instruction: 'Parking available.',
      location: 'On street',
      walkDistance: 'Short walk',
    };
  }
  
  if (parkingDifficulty === 'MODERATE') {
    return {
      instruction: 'Parking available but may be busy.',
      location: 'On street',
      walkDistance: 'Short walk',
      alternative: 'Side street if needed.',
    };
  }
  
  // HARD
  if (parkingDifficulty === 'HARD') {
    return {
      instruction: 'Street parking usually full.',
      location: 'Side street recommended',
      walkDistance: '2-3 minute walk',
      alternative: 'Loading bay nearby.',
    };
  }
  
  return {
    instruction: 'Find nearest parking.',
    location: 'On street',
    walkDistance: 'Short walk',
  };
}

function generateAccessInstruction(
  memory: StopMemory | null
): ArrivalInstruction['access'] {
  if (!memory) {
    return {
      entrance: 'UNKNOWN',
      instruction: 'Use main entrance.',
    };
  }
  
  const entrance = memory.entranceLocation ?? 'UNKNOWN';
  
  if (entrance === 'FRONT') {
    return {
      entrance: 'FRONT',
      instruction: 'Use front entrance.',
    };
  }
  
  if (entrance === 'REAR') {
    return {
      entrance: 'REAR',
      instruction: 'Use rear entrance.',
      notes: 'Usually quieter access.',
    };
  }
  
  if (entrance === 'SIDE') {
    return {
      entrance: 'SIDE',
      instruction: 'Use side entrance.',
    };
  }
  
  return {
    entrance: 'UNKNOWN',
    instruction: 'Use main entrance.',
  };
}

function generateBuildingInfo(
  memory: StopMemory | null
): ArrivalInstruction['building'] {
  if (!memory) {
    return {
      type: 'UNKNOWN',
    };
  }
  
  // Would be populated from address data
  return {
    type: 'UNKNOWN',
    reception: undefined,
    intercom: undefined,
  };
}

function generateCustomerInfo(
  memory: StopMemory | null
): ArrivalInstruction['customer'] | undefined {
  if (!memory) {
    return undefined;
  }
  
  // Would be populated from historical data
  return undefined;
}

function calculateConfidence(memory: StopMemory | null): number {
  if (!memory) {
    return 0.3;
  }
  
  const total = (memory.successCount ?? 0) + (memory.failureCount ?? 0);
  if (total >= 50) return 0.95;
  if (total >= 20) return 0.85;
  if (total >= 10) return 0.7;
  if (total >= 5) return 0.5;
  return 0.3;
}

function getDataQuality(memory: StopMemory | null): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (!memory) {
    return 'LOW';
  }
  
  const total = (memory.successCount ?? 0) + (memory.failureCount ?? 0);
  if (total >= 20) return 'HIGH';
  if (total >= 5) return 'MEDIUM';
  return 'LOW';
}

function buildPrimaryInstruction(
  parking: ArrivalInstruction['parking'],
  access: ArrivalInstruction['access']
): string {
  // Simple, actionable instruction
  const parts: string[] = [];
  
  if (parking.instruction !== 'Parking available.') {
    parts.push(parking.instruction);
  }
  
  if (access.instruction !== 'Use main entrance.') {
    parts.push(access.instruction);
  }
  
  if (parts.length === 0) {
    return 'Proceed to delivery.';
  }
  
  return parts.join('. ');
}

function buildSecondaryInstructions(
  parking: ArrivalInstruction['parking'],
  access: ArrivalInstruction['access'],
  building: ArrivalInstruction['building'],
  customer: ArrivalInstruction['customer'] | undefined
): string[] {
  const instructions: string[] = [];
  
  // Parking alternative
  if (parking.alternative) {
    instructions.push(parking.alternative);
  }
  
  // Walk distance
  if (parking.walkDistance !== 'Short walk') {
    instructions.push(`${parking.walkDistance}.`);
  }
  
  // Access notes
  if (access.notes) {
    instructions.push(access.notes);
  }
  
  // Building info
  if (building.type === 'FLAT' && building.floor) {
    instructions.push(`Flat on ${building.floor}.`);
  }
  
  if (building.reception) {
    instructions.push('Reception on ground floor.');
  }
  
  // Customer info
  if (customer?.typicallyPresent === false) {
    instructions.push('Customer may not be home.');
  }
  
  return instructions;
}

/**
 * Format arrival instruction for voice output.
 */
export function toVoiceInstruction(instruction: ArrivalInstruction): string {
  // Short, clear voice instruction
  let voice = instruction.primaryInstruction;
  
  // Add walk distance if relevant
  if (instruction.parking.walkDistance !== 'Short walk') {
    voice += ` ${instruction.parking.walkDistance} walk.`;
  }
  
  return voice;
}

/**
 * Format arrival instruction for HUD display.
 */
export function toHudDisplay(instruction: ArrivalInstruction): {
  title: string;
  details: string[];
  parkingInfo?: string;
} {
  const details: string[] = [];
  
  // Parking info
  let parkingInfo: string | undefined;
  if (instruction.parking.instruction !== 'Parking available.') {
    parkingInfo = `${instruction.parking.instruction} ${instruction.parking.walkDistance}.`;
  }
  
  // Access info
  if (instruction.access.instruction !== 'Use main entrance.') {
    details.push(instruction.access.instruction);
  }
  
  // Secondary instructions
  details.push(...instruction.secondaryInstructions.slice(0, 2));
  
  return {
    title: instruction.primaryInstruction,
    details: details.slice(0, 2),
    parkingInfo,
  };
}
