/**
 * Delivery Prediction Engine — Types
 * 
 * Unified prediction layer using existing intelligence.
 * Answers: "How likely is this delivery to succeed, and what should the driver do?"
 */

// ─── Core Prediction Types ──────────────────────────────────────────────────────

export interface DeliveryPrediction {
  stopId: string;
  routeId: string;
  driverId: string;
  
  // Timing predictions
  completionProbability: number;       // 0.0 - 1.0
  expectedArrivalTime: Date;
  expectedCompletionSeconds: number;   // seconds
  expectedParkingSeconds: number;      // seconds to find parking
  expectedWalkingDistance: number;     // metres
  
  // Risk assessment
  failureRisk: {
    score: number;                    // 0-100
    reasons: string[];
    probability: number;              // 0.0 - 1.0
  };
  
  // Risk factors
  riskFactors: PredictionRiskFactor[];
  
  // Recommended action
  recommendedAction: PredictionAction;
  
  // Confidence
  confidence: number;                  // 0.0 - 1.0
  dataQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // Metadata
  generatedAt: Date;
  validUntil: Date;
}

export interface PredictionRiskFactor {
  category: 'PARKING' | 'ACCESS' | 'TRAFFIC' | 'WEATHER' | 'CUSTOMER' | 'TIME' | 'ROUTE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  impactOnProbability: number;        // -0.5 to +0.5
  actionable: boolean;
  action?: string;
}

export interface PredictionAction {
  type: 'PROCEED' | 'WARNING' | 'ALTERNATIVE' | 'RESCHEDULE' | 'SKIP';
  priority: 'SILENT' | 'INFORM' | 'ACTION_REQUIRED';
  title: string;
  message: string;
  recommendation?: string;
  alternative?: {
    type: string;
    description: string;
    distanceMetres?: number;
  };
}

// ─── Stop Digital Model Types ───────────────────────────────────────────────────

export interface StopDigitalModel {
  address: string;
  normalizedAddress: string;
  
  // Delivery history
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  successRate: number;                // 0.0 - 1.0
  
  // Timing patterns
  bestArrivalWindows: Array<{
    start: string;                     // HH:MM
    end: string;                       // HH:MM
    successRate: number;
    sampleSize: number;
  }>;
  worstArrivalWindows: Array<{
    start: string;
    end: string;
    successRate: number;
    sampleSize: number;
  }>;
  
  // Parking model
  averageParkingDistanceMetres: number;
  parkingSuccessRate: number;
  worstParkingTime: string;            // e.g., "15:00-16:30"
  
  // Access model
  bestEntrance: 'FRONT' | 'REAR' | 'SIDE' | 'UNKNOWN';
  bestEntranceSuccessRate: number;
  entranceSuccessRates: Record<string, { rate: number; count: number }>;
  
  // Completion model
  averageCompletionSeconds: number;
  completionTimeVariance: number;
  
  // Customer patterns
  customerAvailabilityRate: number;
  typicalCustomerPresent: string;      // e.g., "09:00-17:00"
  
  // Last updated
  lastUpdated: Date;
  dataFreshness: 'FRESH' | 'STALE' | 'HISTORICAL';
}

// ─── Prediction Result Types ────────────────────────────────────────────────────

export interface PredictionResult {
  predictionId: string;
  stopId: string;
  routeId: string;
  driverId: string;
  
  // What was predicted
  predicted: {
    completionProbability: number;
    durationSeconds: number;
    parkingDifficulty: 'EASY' | 'MODERATE' | 'HARD';
    accessDifficulty: 'EASY' | 'MODERATE' | 'HARD';
    failureReasons: string[];
  };
  
  // What actually happened
  actual: {
    completed: boolean;
    completionTimeSeconds?: number;
    parkingTimeSeconds?: number;
    walkingDistanceMetres?: number;
    actualEntrance?: string;
    failureReason?: string;
    driverFeedback?: string;
  };
  
  // Accuracy metrics
  accuracy: {
    completionCorrect: boolean;
    durationErrorSeconds?: number;
    parkingDifficultyCorrect: boolean;
    accuracyScore: number;             // 0-100
  };
  
  // Timestamps
  predictedAt: Date;
  completedAt?: Date;
}

// ─── Driver Suitability Types ─────────────────────────────────────────────────

export interface DriverSuitability {
  driverId: string;
  
  // Overall metrics
  overallSuccessRate: number;
  totalDeliveries: number;
  
  // Specific capabilities
  urbanSuccessRate: number;
  ruralSuccessRate: number;
  highDensitySuccessRate: number;
  
  // Experience factors
  experienceMonths: number;
  deliveriesThisMonth: number;
  similarStopExperience: number;
  
  // Preferences
  walkingToleranceMetres: number;
  prefersEarlyStops: boolean;
  handlesHighRiskStops: boolean;
  
  // Vehicle compatibility
  vehicleFamiliarity: Record<string, number>; // vehicleId -> familiarity score
  
  // Recommendations
  recommendedRouteComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  strengths: string[];
  improvementAreas: string[];
}

// ─── Notification Types ────────────────────────────────────────────────────────

export interface SmartNotification {
  priority: 'SILENT' | 'INFORM' | 'ACTION_REQUIRED';
  title?: string;
  message: string;
  icon?: string;
  actionLabel?: string;
  
  // Voice compatibility
  voicePrompt?: string;
  voiceResponses?: string[];
  
  // Display rules
  maxDisplaySeconds: number;
  canDismiss: boolean;
  requiresAcknowledgment: boolean;
}

// ─── Prediction Request Types ──────────────────────────────────────────────────

export interface PredictionRequest {
  stopId: string;
  routeId: string;
  driverId: string;
  
  // Location
  stopLat: number;
  stopLng: number;
  address: string;
  
  // Timing
  currentTime: Date;
  estimatedArrivalTime: Date;
  
  // Context
  vehicleId: string;
  remainingStops: number;
  
  // External data (optional)
  trafficData?: {
    congestionLevel: number;
    incidents: Array<{ type: string; severity: string }>;
  };
  weatherData?: {
    condition: string;
    temperature?: number;
    visibility?: number;
  };
}

// ─── Batch Prediction Types ────────────────────────────────────────────────────

export interface RoutePrediction {
  routeId: string;
  driverId: string;
  
  // Overall route prediction
  routeCompletionProbability: number;
  estimatedTotalDurationSeconds: number;
  estimatedTotalDistanceKm: number;
  
  // Per-stop predictions
  stopPredictions: DeliveryPrediction[];
  
  // Route-level risks
  routeRisks: PredictionRiskFactor[];
  
  // Optimization recommendations
  recommendedReorder?: Array<{
    fromIndex: number;
    toIndex: number;
    reason: string;
    estimatedImprovement: number;
  }>;
  
  // Summary
  highRiskStops: number;
  mediumRiskStops: number;
  lowRiskStops: number;
  
  generatedAt: Date;
}
