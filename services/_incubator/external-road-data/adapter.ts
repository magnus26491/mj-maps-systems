/**
 * External Road Data Provider Adapter
 * 
 * Provides a unified interface for all traffic and road data providers.
 * Handles provider selection, fallback, and data aggregation.
 */

import type {
  RoadDataProvider,
  GeoBounds,
  TrafficData,
  IncidentData,
  RestrictionData,
  ProviderId,
  ProviderStatus,
} from './types';

// Provider registry
const providers = new Map<ProviderId, RoadDataProvider>();
const providerStatus = new Map<ProviderId, ProviderStatus>();

/**
 * Register a road data provider
 */
export function registerProvider(provider: RoadDataProvider): void {
  providers.set(provider.id, provider);
  providerStatus.set(provider.id, {
    providerId: provider.id,
    available: false,
    lastCheck: new Date().toISOString(),
  });
}

/**
 * Get all registered providers, sorted by priority
 */
export function getProviders(): RoadDataProvider[] {
  return Array.from(providers.values())
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Get the best available provider
 */
export function getBestProvider(): RoadDataProvider | undefined {
  const availableProviders = Array.from(providers.values())
    .filter(p => providerStatus.get(p.id)?.available);
  
  if (availableProviders.length === 0) {
    // Return any registered provider as fallback
    return Array.from(providers.values())[0];
  }
  
  return availableProviders
    .sort((a, b) => b.priority - a.priority)[0];
}

/**
 * Check provider health
 */
export async function checkProviderHealth(providerId: ProviderId): Promise<ProviderStatus> {
  const provider = providers.get(providerId);
  
  if (!provider) {
    return {
      providerId,
      available: false,
      error: 'Provider not registered',
      lastCheck: new Date().toISOString(),
    };
  }
  
  const start = Date.now();
  
  try {
    const available = await provider.isAvailable();
    const latencyMs = Date.now() - start;
    
    const status: ProviderStatus = {
      providerId,
      available,
      latencyMs,
      lastCheck: new Date().toISOString(),
    };
    
    providerStatus.set(providerId, status);
    return status;
  } catch (error) {
    const status: ProviderStatus = {
      providerId,
      available: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
      lastCheck: new Date().toISOString(),
    };
    
    providerStatus.set(providerId, status);
    return status;
  }
}

/**
 * Get all provider statuses
 */
export async function getAllProviderStatuses(): Promise<ProviderStatus[]> {
  const checks = Array.from(providers.keys()).map(checkProviderHealth);
  return Promise.all(checks);
}

/**
 * Get traffic data from all available providers
 */
export async function getTrafficData(bounds: GeoBounds): Promise<Map<ProviderId, TrafficData[]>> {
  const results = new Map<ProviderId, TrafficData[]>();
  
  for (const [id, status] of providerStatus) {
    if (!status.available) continue;
    
    const provider = providers.get(id);
    if (!provider) continue;
    
    try {
      const data = await provider.getTrafficData(bounds);
      results.set(id, data);
    } catch (error) {
      console.error(`Failed to get traffic data from ${id}:`, error);
    }
  }
  
  return results;
}

/**
 * Get incident data from all available providers
 */
export async function getIncidentData(bounds: GeoBounds): Promise<Map<ProviderId, IncidentData[]>> {
  const results = new Map<ProviderId, IncidentData[]>();
  
  for (const [id, status] of providerStatus) {
    if (!status.available) continue;
    
    const provider = providers.get(id);
    if (!provider) continue;
    
    try {
      const data = await provider.getIncidents(bounds);
      results.set(id, data);
    } catch (error) {
      console.error(`Failed to get incidents from ${id}:`, error);
    }
  }
  
  return results;
}

/**
 * Get restriction data from all available providers
 */
export async function getRestrictionData(bounds: GeoBounds): Promise<Map<ProviderId, RestrictionData[]>> {
  const results = new Map<ProviderId, RestrictionData[]>();
  
  for (const [id, status] of providerStatus) {
    if (!status.available) continue;
    
    const provider = providers.get(id);
    if (!provider) continue;
    
    try {
      const data = await provider.getRestrictions(bounds);
      results.set(id, data);
    } catch (error) {
      console.error(`Failed to get restrictions from ${id}:`, error);
    }
  }
  
  return results;
}

/**
 * Aggregate traffic data from multiple providers
 * Higher priority provider data takes precedence
 */
export function aggregateTrafficData(
  data: Map<ProviderId, TrafficData[]>
): TrafficData[] {
  const aggregated = new Map<string, TrafficData>();
  
  // Sort providers by priority
  const sortedProviders = getProviders();
  
  for (const provider of sortedProviders) {
    const providerData = data.get(provider.id);
    if (!providerData) continue;
    
    for (const traffic of providerData) {
      // Use road ID as key
      const key = traffic.roadId;
      
      // Only override if this provider has higher confidence
      const existing = aggregated.get(key);
      if (!existing || (traffic.confidence && (!existing.confidence || traffic.confidence > existing.confidence))) {
        aggregated.set(key, traffic);
      }
    }
  }
  
  return Array.from(aggregated.values());
}

/**
 * Aggregate incidents from multiple providers
 * Higher priority provider data takes precedence
 */
export function aggregateIncidents(
  data: Map<ProviderId, IncidentData[]>
): IncidentData[] {
  const aggregated = new Map<string, IncidentData>();
  
  const sortedProviders = getProviders();
  
  for (const provider of sortedProviders) {
    const providerData = data.get(provider.id);
    if (!providerData) continue;
    
    for (const incident of providerData) {
      const key = incident.incidentId;
      
      const existing = aggregated.get(key);
      if (!existing || getSeverityWeight(incident.severity) > getSeverityWeight(existing.severity)) {
        aggregated.set(key, incident);
      }
    }
  }
  
  return Array.from(aggregated.values());
}

/**
 * Aggregate restrictions from multiple providers
 */
export function aggregateRestrictions(
  data: Map<ProviderId, RestrictionData[]>
): RestrictionData[] {
  const aggregated = new Map<string, RestrictionData>();
  
  const sortedProviders = getProviders();
  
  for (const provider of sortedProviders) {
    const providerData = data.get(provider.id);
    if (!providerData) continue;
    
    for (const restriction of providerData) {
      const key = `${restriction.restrictionId}_${restriction.type}`;
      
      // Keep the more detailed description
      const existing = aggregated.get(key);
      if (!existing || (restriction.description.length > existing.description.length)) {
        aggregated.set(key, restriction);
      }
    }
  }
  
  return Array.from(aggregated.values());
}

function getSeverityWeight(severity: string): number {
  const weights: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return weights[severity] || 0;
}

// ─── HERE Provider Implementation ────────────────────────────────────────────────

interface HereConfig {
  apiKey: string;
  baseUrl?: string;
}

export function createHereProvider(config: HereConfig): RoadDataProvider {
  const baseUrl = config.baseUrl || 'https://data.traffic.ls.hereapi.com/3.1';
  
  return {
    id: 'here',
    name: 'HERE Traffic',
    priority: 4,
    
    async getTrafficData(bounds: GeoBounds): Promise<TrafficData[]> {
      // HERE Traffic API implementation would go here
      // For now, return empty array
      return [];
    },
    
    async getIncidents(bounds: GeoBounds): Promise<IncidentData[]> {
      // HERE Incident API implementation would go here
      return [];
    },
    
    async getRestrictions(bounds: GeoBounds): Promise<RestrictionData[]> {
      // HERE Restrictions API implementation would go here
      return [];
    },
    
    async isAvailable(): Promise<boolean> {
      try {
        // Simple health check
        return !!config.apiKey;
      } catch {
        return false;
      }
    },
  };
}

// ─── TomTom Provider Implementation ────────────────────────────────────────────

interface TomTomConfig {
  apiKey: string;
  baseUrl?: string;
}

export function createTomTomProvider(config: TomTomConfig): RoadDataProvider {
  const baseUrl = config.baseUrl || 'https://api.tomtom.com';
  
  return {
    id: 'tomtom',
    name: 'TomTom Traffic',
    priority: 3,
    
    async getTrafficData(bounds: GeoBounds): Promise<TrafficData[]> {
      // TomTom Traffic API implementation would go here
      return [];
    },
    
    async getIncidents(bounds: GeoBounds): Promise<IncidentData[]> {
      // TomTom Incident API implementation would go here
      return [];
    },
    
    async getRestrictions(bounds: GeoBounds): Promise<RestrictionData[]> {
      // TomTom Restrictions API implementation would go here
      return [];
    },
    
    async isAvailable(): Promise<boolean> {
      try {
        return !!config.apiKey;
      } catch {
        return false;
      }
    },
  };
}

// ─── Google Provider Implementation ────────────────────────────────────────────

interface GoogleConfig {
  apiKey: string;
}

export function createGoogleProvider(config: GoogleConfig): RoadDataProvider {
  return {
    id: 'google',
    name: 'Google Traffic',
    priority: 2,
    
    async getTrafficData(bounds: GeoBounds): Promise<TrafficData[]> {
      // Google Traffic API implementation would go here
      return [];
    },
    
    async getIncidents(bounds: GeoBounds): Promise<IncidentData[]> {
      // Google Incidents API implementation would go here
      return [];
    },
    
    async getRestrictions(bounds: GeoBounds): Promise<RestrictionData[]> {
      // Google Restrictions API implementation would go here
      return [];
    },
    
    async isAvailable(): Promise<boolean> {
      try {
        return !!config.apiKey;
      } catch {
        return false;
      }
    },
  };
}
