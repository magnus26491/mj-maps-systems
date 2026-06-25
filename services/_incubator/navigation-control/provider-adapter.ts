/**
 * Navigation Provider Adapter
 * 
 * Abstract interface for navigation providers.
 * Current: Google Maps
 * Future: HERE, TomTom, Internal Navigation Engine
 */

export type NavigationProviderId = 'google' | 'here' | 'tomtom' | 'internal';

export interface RouteResult {
  provider: NavigationProviderId;
  polyline: Array<{ lat: number; lng: number }>;
  instructions: ProviderInstruction[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  trafficDelaysSeconds: number;
}

export interface ProviderInstruction {
  instruction: string;
  maneuver: string;
  distanceMetres: number;
  durationSeconds: number;
  roadName?: string;
  lat: number;
  lng: number;
}

export interface RouteRequest {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  vehicleId: string;
  avoid?: string[];
  departureTime?: Date;
}

// ─── Provider Interface ─────────────────────────────────────────────────────────

export interface NavigationProvider {
  readonly id: NavigationProviderId;
  readonly name: string;
  
  calculateRoute(request: RouteRequest): Promise<RouteResult>;
  getTraffic(request: RouteRequest): Promise<TrafficInfo>;
  reroute(request: RouteRequest, avoidSegment?: string): Promise<RouteResult>;
}

export interface TrafficInfo {
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  incidents: TrafficIncident[];
  delaysSeconds: number;
}

export interface TrafficIncident {
  type: 'ACCIDENT' | 'CONSTRUCTION' | 'EVENT' | 'WEATHER' | 'ROAD_CLOSED';
  location: string;
  description: string;
  delaySeconds: number;
}

// ─── Provider Registry ─────────────────────────────────────────────────────────

const providers = new Map<NavigationProviderId, NavigationProvider>();

export function registerProvider(provider: NavigationProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: NavigationProviderId): NavigationProvider | undefined {
  return providers.get(id);
}

export function getAllProviders(): NavigationProvider[] {
  return Array.from(providers.values());
}

// ─── Google Maps Provider ──────────────────────────────────────────────────────

export class GoogleMapsProvider implements NavigationProvider {
  readonly id: NavigationProviderId = 'google';
  readonly name = 'Google Maps';
  
  async calculateRoute(request: RouteRequest): Promise<RouteResult> {
    const key = process.env.GEOAPIFY_API_KEY;
    if (!key) {
      throw new Error('GEOAPIFY_API_KEY not configured');
    }
    
    // Use Geoapify as the routing backend (Google Maps API replacement)
    const vehicleProfile = request.vehicleId.toLowerCase();
    let mode = 'drive';
    
    if (vehicleProfile.includes('cycle') || vehicleProfile.includes('bike')) {
      mode = 'bicycle';
    } else if (vehicleProfile.includes('walk')) {
      mode = 'pedestrian';
    }
    
    const url = `https://router.geoapify.com/v1/routing`
      + `?waypoints=${request.fromLat},${request.fromLng}|${request.toLat},${request.toLng}`
      + `&mode=${mode}&format=json&apiKey=${key}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Route calculation failed: ${response.status}`);
    }
    
    const json = await response.json();
    const feature = json?.features?.[0];
    
    if (!feature) {
      throw new Error('No route found');
    }
    
    const props = feature.properties ?? {};
    const coords = feature.geometry?.coordinates ?? [];
    
    const instructions: ProviderInstruction[] = (props.legs?.[0]?.steps ?? []).map((s: any) => ({
      instruction: s.instruction?.text ?? s.maneuver?.instruction ?? '',
      maneuver: normalizeManeuver(s.instruction?.type ?? s.maneuver?.type),
      distanceMetres: s.distance ?? 0,
      durationSeconds: s.time ?? 0,
      roadName: s.name,
      lat: s.location?.coordinates?.[1] ?? 0,
      lng: s.location?.coordinates?.[0] ?? 0,
    }));
    
    return {
      provider: this.id,
      polyline: coords.map(([lng, lat]: [number, number]) => ({ lat, lng })),
      instructions,
      totalDistanceMeters: props.distance ?? 0,
      totalDurationSeconds: props.time ?? 0,
      trafficDelaysSeconds: 0,
    };
  }
  
  async getTraffic(request: RouteRequest): Promise<TrafficInfo> {
    // Geoapify doesn't provide real-time traffic, so we estimate
    const hour = new Date().getHours();
    
    let level: TrafficInfo['level'] = 'LOW';
    let delaysSeconds = 0;
    
    if (hour >= 7 && hour <= 9) {
      level = 'HIGH';
      delaysSeconds = 300;
    } else if (hour >= 16 && hour <= 18) {
      level = 'HIGH';
      delaysSeconds = 480;
    } else if (hour >= 11 && hour <= 14) {
      level = 'MEDIUM';
      delaysSeconds = 120;
    }
    
    return {
      level,
      incidents: [],
      delaysSeconds,
    };
  }
  
  async reroute(request: RouteRequest, avoidSegment?: string): Promise<RouteResult> {
    // For now, just recalculate
    return this.calculateRoute(request);
  }
}

// ─── Provider Normalizers ──────────────────────────────────────────────────────

function normalizeManeuver(type: string | undefined): string {
  if (!type) return 'straight';
  
  const lower = type.toLowerCase();
  const map: Record<string, string> = {
    'right': 'turn-right',
    'left': 'turn-left',
    'sharpright': 'turn-sharp-right',
    'sharpleft': 'turn-sharp-left',
    'slightright': 'turn-slight-right',
    'slightleft': 'turn-slight-left',
    'straight': 'straight',
    'continue': 'continue',
    'roundabout': 'roundabout',
    'exit-roundabout': 'exit-roundabout',
    'u-turn': 'u-turn',
    'uturn': 'u-turn',
    'startat': 'depart',
    'destinationreached': 'arrive',
    'depart': 'depart',
    'arrive': 'arrive',
  };
  
  return map[lower] ?? 'straight';
}

// ─── Initialize Default Provider ────────────────────────────────────────────────

// Register Google Maps as the default provider
registerProvider(new GoogleMapsProvider());
