/**
 * Telemetry Types
 * 
 * Type definitions for all telemetry events and metrics.
 */

// ─── Driver Event Types ──────────────────────────────────────────────────────

export type DriverEventType =
  | 'app_startup'
  | 'app_error'
  | 'app_crash'
  | 'route_preparation_start'
  | 'route_preparation_complete'
  | 'stop_completed'
  | 'stop_failed'
  | 'replan_accepted'
  | 'replan_rejected'
  | 'navigation_started'
  | 'navigation_override'
  | 'voice_command_used'
  | 'incident_reported'
  | 'shift_started'
  | 'shift_ended';

export interface DriverEvent {
  eventType: DriverEventType;
  driverId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  // Performance metrics
  durationMs?: number;
  // Route context
  routeId?: string;
  stopId?: string;
}

// ─── Route Metric Types ───────────────────────────────────────────────────────

export interface RouteMetric {
  routeId: string;
  driverId: string;
  timestamp: Date;
  
  // Prediction metrics
  predictedEta?: Date;
  actualEta?: Date;
  etaErrorMinutes?: number;
  
  // Confidence metrics
  initialConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  finalConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // Parking prediction
  predictedParkingDifficulty?: 'EASY' | 'MODERATE' | 'HARD';
  actualParkingTimeMinutes?: number;
  
  // Route optimization
  reorderCount?: number;
  reorderSuccessRate?: number;
  
  // Navigation
  navigationOverrideCount?: number;
  navigationTotalDistance?: number;
  
  // Completion
  totalStops?: number;
  completedStops?: number;
  failedStops?: number;
  completionRate?: number;
}

// ─── Product Metric Types ─────────────────────────────────────────────────────

export type ProductEventType =
  | 'user_login'
  | 'user_logout'
  | 'plan_upgrade'
  | 'plan_downgrade'
  | 'plan_trial_start'
  | 'plan_trial_end'
  | 'route_created'
  | 'route_completed'
  | 'feature_used'
  | 'onboarding_complete';

export interface ProductMetric {
  eventType: ProductEventType;
  userId?: string;
  driverId?: string;
  timestamp: Date;
  
  // Conversion metrics
  fromPlan?: 'free' | 'pro' | 'enterprise';
  toPlan?: 'free' | 'pro' | 'enterprise';
  
  // Usage metrics
  plan?: 'free' | 'pro' | 'enterprise';
  features?: string[];
  
  // Route metrics
  routeId?: string;
  stopsCount?: number;
  
  // Attribution
  source?: string;
  utmCampaign?: string;
}

// ─── Technical Metric Types ───────────────────────────────────────────────────

export interface ApiLatencyMetric {
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  timestamp: Date;
  driverId?: string;
  error?: string;
}

export interface ServiceHealthMetric {
  service: 'api' | 'redis' | 'database' | 'queue' | 'gps';
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  errorRate?: number;
  timestamp: Date;
  details?: string;
}

export interface GpsUpdateMetric {
  driverId: string;
  timestamp: Date;
  success: boolean;
  latencyMs?: number;
  error?: string;
  routeId?: string;
}

// ─── Telemetry Summary Types ──────────────────────────────────────────────────

export interface TelemetrySummary {
  generatedAt: Date;
  period: { start: Date; end: Date };
  
  driver: {
    activeDrivers: number;
    avgStopsPerHour: number;
    avgFailedDeliveries: number;
    replanAcceptanceRate: number;
    voiceUsageRate: number;
    incidentCount: number;
    crashCount: number;
  };
  
  routes: {
    totalRoutes: number;
    avgEtaErrorMinutes: number;
    confidenceAccuracy: number;
    parkingAccuracy: number;
    reorderSuccessRate: number;
    avgCompletionRate: number;
  };
  
  product: {
    totalDrivers: number;
    freeDrivers: number;
    proDrivers: number;
    enterpriseDrivers: number;
    freeToProConversions: number;
    avgStopsPerDay: number;
    topFeatures: Array<{ feature: string; usageCount: number }>;
  };
  
  technical: {
    apiAvgLatencyMs: number;
    apiP99LatencyMs: number;
    apiErrorRate: number;
    redisStatus: 'healthy' | 'degraded' | 'unhealthy';
    databaseStatus: 'healthy' | 'degraded' | 'unhealthy';
    gpsUpdateSuccessRate: number;
    queueFailureRate: number;
  };
}

// ─── Generic Telemetry Event ─────────────────────────────────────────────────

export interface TelemetryEvent {
  category: 'driver' | 'route' | 'product' | 'technical';
  eventType: string;
  timestamp: Date;
  driverId?: string;
  userId?: string;
  routeId?: string;
  metadata: Record<string, unknown>;
}
