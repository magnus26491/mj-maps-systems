/**
 * Driver Memory - Types
 * 
 * Personal intelligence layer that combines:
 * - Global Intelligence (all drivers)
 * - Driver History (this driver's experience)
 * - Vehicle History (with this vehicle)
 * - Fleet Similarity (similar drivers)
 */

export interface DriverStopMemory {
  // Identity
  driverId: string;
  addressNormalized: string;
  
  // Delivery history
  successfulDeliveries: number;
  failedDeliveries: number;
  lastDeliveryDate?: Date;
  averageCompletionTimeSeconds: number;
  
  // Preferences learned
  preferredParking: string;
  preferredApproach: string;
  preferredEntrance: string;
  walkingToleranceMetres: number;
  
  // Problems encountered
  problemsEncountered: string[];
  lastProblemDate?: Date;
  
  // Vehicle specific
  vehicleHistory: VehicleMemory[];
  
  // Fleet context
  fleetSuccessRate: number;
  similarDriverCount: number;
  
  // Confidence
  memoryConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
  sampleSize: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface VehicleMemory {
  vehicleId: string;
  deliveries: number;
  successRate: number;
  avgCompletionSeconds: number;
  preferredParking?: string;
  preferredApproach?: string;
}

export interface DriverPreference {
  driverId: string;
  
  // General preferences
  parkingStyle: 'CLOSE' | 'CONVENIENT' | 'FREE';
  maxParkingWalkMetres: number;
  prefersLoadingBay: boolean;
  prefersFrontEntrance: boolean;
  maxAccessWalkMetres: number;
  
  // Delivery style
  deliverySpeed: 'FAST' | 'STANDARD' | 'CAREFUL';
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // Time preferences
  peakHourAvoidance: boolean;
  prefersMorningStops: boolean;
  
  // Vehicle preferences
  preferredVehicleSize: 'SMALL' | 'MEDIUM' | 'LARGE';
  familiarVehicles: Record<string, number>;
  
  // Confidence
  profileConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
  sampleSize: number;
}

export interface CombinedMemory {
  // Address
  addressNormalized: string;
  
  // Weighted combination
  recommendedParking?: string;
  recommendedApproach?: string;
  recommendedEntrance?: string;
  walkingDistanceMetres: number;
  
  // Confidence weights
  weights: {
    currentConditions: number;  // 50%
    driverMemory: number;       // 30%
    fleetIntelligence: number;  // 20%
  };
  
  // Evidence
  evidence: MemoryEvidence;
  
  // Confidence
  overallConfidence: number;
}

export interface MemoryEvidence {
  // Current conditions
  currentConditionsScore: number;
  currentConditionsReasons: string[];
  
  // Driver memory
  driverDeliveries: number;
  driverSuccessRate: number;
  driverMemoryScore: number;
  driverMemoryReasons: string[];
  
  // Fleet intelligence
  fleetDeliveries: number;
  fleetSuccessRate: number;
  fleetScore: number;
  fleetReasons: string[];
}
