/**
 * External Road Data Types
 * 
 * Common type definitions for external traffic and road data providers.
 */

export type ProviderId = 'here' | 'tomtom' | 'google' | 'internal';

export interface RoadDataProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly priority: number;  // Higher = more trusted
  
  // Traffic data
  getTrafficData(bounds: GeoBounds): Promise<TrafficData[]>;
  
  // Incident data
  getIncidents(bounds: GeoBounds): Promise<IncidentData[]>;
  
  // Restrictions
  getRestrictions(bounds: GeoBounds): Promise<RestrictionData[]>;
  
  // Health check
  isAvailable(): Promise<boolean>;
}

export interface GeoBounds {
  northLat: number;
  southLat: number;
  eastLng: number;
  westLng: number;
}

export interface GeoCoord {
  lat: number;
  lng: number;
}

export interface TrafficData {
  roadId: string;
  roadName?: string;
  location: GeoCoord;
  freeFlowSpeed?: number;      // km/h
  currentSpeed?: number;        // km/h
  congestionLevel: 'none' | 'light' | 'moderate' | 'heavy' | 'blocked';
  confidence?: number;          // 0-1
  lastUpdated: string;
  source: ProviderId;
}

export interface IncidentData {
  incidentId: string;
  type: IncidentType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: GeoCoord;
  radius?: number;              // metres affected
  roadName?: string;
  description: string;
  startTime?: string;
  endTime?: string;
  delaySeconds?: number;
  source: ProviderId;
}

export type IncidentType = 
  | 'accident'
  | 'roadwork'
  | 'road_closure'
  | 'event'
  | 'weather'
  | 'breakdown'
  | 'hazard';

export interface RestrictionData {
  restrictionId: string;
  type: RestrictionType;
  location: GeoCoord;
  roadName?: string;
  value?: string;
  description: string;
  appliesTo: VehicleCategory[];
  startTime?: string;
  endTime?: string;
  source: ProviderId;
}

export type RestrictionType = 
  | 'weight_limit'
  | 'height_limit'
  | 'width_limit'
  | 'length_limit'
  | 'prohibited_turn'
  | 'access_restriction'
  | 'low_emission_zone'
  | 'congestion_charge'
  | 'toll'
  | 'pedestrian_zone';

export type VehicleCategory = 
  | 'car'
  | 'van'
  | 'truck'
  | 'hgv'
  | 'all';

export interface ProviderStatus {
  providerId: ProviderId;
  available: boolean;
  latencyMs?: number;
  lastCheck: string;
  error?: string;
}
