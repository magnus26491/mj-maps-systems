/**
 * Environmental Intelligence
 * 
 * Calculates environmental risks: flooding, tidal roads, weather warnings.
 */

import type { RiskSeverity } from './types';

export interface EnvironmentalRisk {
  stopId: string;
  
  // Tidal conditions
  tidal: {
    isTidalRoad: boolean;
    highTideTime?: string;
    etaAtStop?: string;
    riskWindow?: { start: string; end: string };
    severity: RiskSeverity;
    roadPassable: boolean;
  };
  
  // Weather conditions
  weather: {
    condition: 'CLEAR' | 'RAIN' | 'HEAVY_RAIN' | 'SNOW' | 'FOG' | 'HIGH_WIND' | 'EXTREME';
    temperature?: number;
    visibilityMetres?: number;
    windSpeedKmh?: number;
    impactOnDelivery: string;
    severity: RiskSeverity;
  };
  
  // Flooding
  flooding: {
    isFloodProneArea: boolean;
    currentLevel?: 'NONE' | 'WATCH' | 'WARNING' | 'SEVERE';
    advisory?: string;
    alternativeRouteAvailable: boolean;
    severity: RiskSeverity;
  };
  
  // Combined assessment
  overallSeverity: RiskSeverity;
  driverAdvice: string;
  deadline?: string;
  isActionRequired: boolean;
}

/**
 * UK Tidal Road Data
 * These would typically come from an external API
 */
const TIDAL_ROADS: Record<string, { lat: number; lng: number; window: number }> = {
  // Example coastal roads that flood at high tide
  'A259_Sussex': { lat: 50.8, lng: 0.3, window: 30 }, // Brighton coast
  'A259_Sussex_East': { lat: 50.9, lng: 0.5, window: 45 },
};

/**
 * Flood-prone areas
 * These would typically come from Environment Agency data
 */
const FLOOD_PRONE_AREAS: Array<{ lat: number; lng: number; radius: number; risk: 'WATCH' | 'WARNING' | 'SEVERE' }> = [
  // Example locations
  { lat: 51.5, lng: -0.1, radius: 0.5, risk: 'WATCH' }, // Thames areas
];

/**
 * Assess environmental conditions for a stop.
 */
export function assessEnvironmentalConditions(params: {
  stopId: string;
  stopLat: number;
  stopLng: number;
  etaTime: Date;
  weatherCondition?: string;
  temperature?: number;
  visibility?: number;
}): EnvironmentalRisk {
  const { stopId, stopLat, stopLng, etaTime, weatherCondition, temperature, visibility } = params;
  
  // Assess tidal risk
  const tidal = assessTidalConditions(stopLat, stopLng, etaTime);
  
  // Assess weather risk
  const weather = assessWeatherConditions(weatherCondition, temperature, visibility, etaTime);
  
  // Assess flooding risk
  const flooding = assessFloodRisk(stopLat, stopLng);
  
  // Determine overall severity
  const severities: RiskSeverity[] = [tidal.severity, weather.severity, flooding.severity];
  const overallSeverity = getHighestSeverity(severities);
  
  // Generate driver advice
  const driverAdvice = generateEnvironmentalAdvice(tidal, weather, flooding, overallSeverity);
  
  // Determine deadline
  let deadline: string | undefined;
  if (tidal.severity !== 'LOW' && tidal.highTideTime) {
    // Recommend arriving 30 minutes before high tide
    deadline = tidal.highTideTime;
  }
  
  // Determine if action required
  const isActionRequired = overallSeverity === 'HIGH' || overallSeverity === 'CRITICAL';
  
  return {
    stopId,
    tidal,
    weather,
    flooding,
    overallSeverity,
    driverAdvice,
    deadline,
    isActionRequired,
  };
}

function assessTidalConditions(
  lat: number,
  lng: number,
  etaTime: Date
): EnvironmentalRisk['tidal'] {
  // Check if near known tidal road
  let isTidalRoad = false;
  let nearestTidalRoad: typeof TIDAL_ROADS[string] | null = null;
  let minDistance = Infinity;
  
  for (const [_, road] of Object.entries(TIDAL_ROADS)) {
    const dist = haversineKm(lat, lng, road.lat, road.lng);
    if (dist < 0.5 && dist < minDistance) {
      isTidalRoad = true;
      nearestTidalRoad = road;
      minDistance = dist;
    }
  }
  
  if (!isTidalRoad || !nearestTidalRoad) {
    return {
      isTidalRoad: false,
      severity: 'LOW',
      roadPassable: true,
    };
  }
  
  // Calculate high tide time (simplified - would use real tidal data)
  const now = new Date();
  const hoursUntilEta = (etaTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  // Simplified tidal calculation (actual implementation would use API)
  const highTideHour = 16.7; // 16:42 in decimal hours
  const currentHour = now.getHours() + now.getMinutes() / 60;
  let nextHighTide = highTideHour;
  
  if (currentHour > highTideHour) {
    nextHighTide = highTideHour + 12.42; // Average high tide interval
  }
  
  const highTideTime = `${Math.floor(nextHighTide)}:${String(Math.round((nextHighTide % 1) * 60)).padStart(2, '0')}`;
  
  // Check if ETA is within risk window
  const etaHour = etaTime.getHours() + etaTime.getMinutes() / 60;
  const riskWindowMinutes = nearestTidalRoad.window;
  const riskStart = nextHighTide - riskWindowMinutes / 60;
  const riskEnd = nextHighTide + riskWindowMinutes / 60;
  
  const inRiskWindow = etaHour >= riskStart && etaHour <= riskEnd;
  
  let severity: RiskSeverity = 'LOW';
  if (inRiskWindow && etaHour > nextHighTide - 0.25) {
    severity = 'CRITICAL';
  } else if (inRiskWindow) {
    severity = 'HIGH';
  } else if (Math.abs(etaHour - nextHighTide) < 1) {
    severity = 'MEDIUM';
  }
  
  return {
    isTidalRoad: true,
    highTideTime,
    etaAtStop: `${etaTime.getHours()}:${String(etaTime.getMinutes()).padStart(2, '0')}`,
    riskWindow: {
      start: `${Math.floor(riskStart)}:${String(Math.round((riskStart % 1) * 60)).padStart(2, '0')}`,
      end: `${Math.floor(riskEnd)}:${String(Math.round((riskEnd % 1) * 60)).padStart(2, '0')}`,
    },
    severity,
    roadPassable: severity !== 'CRITICAL',
  };
}

function assessWeatherConditions(
  condition?: string,
  temperature?: number,
  visibility?: number,
  etaTime?: Date
): EnvironmentalRisk['weather'] {
  const cond = condition?.toUpperCase() ?? 'CLEAR';
  
  let weatherCond: EnvironmentalRisk['weather']['condition'] = 'CLEAR';
  let severity: RiskSeverity = 'LOW';
  let impact = 'Normal delivery conditions';
  
  if (cond.includes('RAIN') || cond.includes('DRIZZLE')) {
    weatherCond = cond.includes('HEAVY') ? 'HEAVY_RAIN' : 'RAIN';
    severity = cond.includes('HEAVY') ? 'MEDIUM' : 'LOW';
    impact = 'Reduced walking speed expected';
  } else if (cond.includes('SNOW') || cond.includes('SLEET')) {
    weatherCond = 'SNOW';
    severity = 'HIGH';
    impact = 'Significant delays likely';
  } else if (cond.includes('FOG') || cond.includes('MIST')) {
    weatherCond = 'FOG';
    severity = 'MEDIUM';
    impact = 'Reduced visibility, drive carefully';
  } else if (cond.includes('WIND')) {
    weatherCond = 'HIGH_WIND';
    severity = temperature !== undefined && temperature < 0 ? 'HIGH' : 'MEDIUM';
    impact = 'Strong winds may affect walking';
  } else if (cond.includes('THUNDER') || cond.includes('STORM')) {
    weatherCond = 'EXTREME';
    severity = 'CRITICAL';
    impact = 'Seek shelter if unsafe';
  }
  
  // Check temperature
  if (temperature !== undefined) {
    if (temperature < -5) {
      severity = severity === 'LOW' ? 'MEDIUM' : severity;
      impact += ', ice possible';
    } else if (temperature > 35) {
      severity = severity === 'LOW' ? 'MEDIUM' : severity;
      impact += ', heat advisory';
    }
  }
  
  // Check visibility
  if (visibility !== undefined && visibility < 100) {
    severity = 'HIGH';
    impact = 'Very poor visibility, extreme caution required';
  } else if (visibility !== undefined && visibility < 1000) {
    severity = severity === 'LOW' ? 'MEDIUM' : severity;
    impact = 'Reduced visibility, drive carefully';
  }
  
  return {
    condition: weatherCond,
    temperature,
    visibilityMetres: visibility,
    impactOnDelivery: impact,
    severity,
  };
}

function assessFloodRisk(lat: number, lng: number): EnvironmentalRisk['flooding'] {
  // Check if in flood-prone area
  let isProne = false;
  let risk: 'WATCH' | 'WARNING' | 'SEVERE' = 'NONE';
  
  for (const area of FLOOD_PRONE_AREAS) {
    const dist = haversineKm(lat, lng, area.lat, area.lng);
    if (dist < area.radius) {
      isProne = true;
      risk = area.risk;
      break;
    }
  }
  
  if (!isProne) {
    return {
      isFloodProneArea: false,
      severity: 'LOW',
      alternativeRouteAvailable: false,
    };
  }
  
  let severity: RiskSeverity = 'LOW';
  if (risk === 'SEVERE') severity = 'CRITICAL';
  else if (risk === 'WARNING') severity = 'HIGH';
  else if (risk === 'WATCH') severity = 'MEDIUM';
  
  return {
    isFloodProneArea: true,
    currentLevel: risk,
    advisory: risk === 'SEVERE' 
      ? 'Flooding expected, do not attempt'
      : risk === 'WARNING'
      ? 'Flooding possible, take caution'
      : 'Be aware of potential flooding',
    alternativeRouteAvailable: true,
    severity,
  };
}

function getHighestSeverity(severities: RiskSeverity[]): RiskSeverity {
  if (severities.includes('CRITICAL')) return 'CRITICAL';
  if (severities.includes('HIGH')) return 'HIGH';
  if (severities.includes('MEDIUM')) return 'MEDIUM';
  return 'LOW';
}

function generateEnvironmentalAdvice(
  tidal: EnvironmentalRisk['tidal'],
  weather: EnvironmentalRisk['weather'],
  flooding: EnvironmentalRisk['flooding'],
  overallSeverity: RiskSeverity
): string {
  if (overallSeverity === 'LOW') {
    return 'Environmental conditions normal';
  }
  
  const warnings: string[] = [];
  
  if (tidal.severity !== 'LOW') {
    if (tidal.highTideTime) {
      warnings.push(`High tide at ${tidal.highTideTime}`);
    }
  }
  
  if (weather.severity !== 'LOW') {
    warnings.push(weather.condition.replace('_', ' ').toLowerCase());
  }
  
  if (flooding.severity !== 'LOW') {
    warnings.push('flood risk area');
  }
  
  if (warnings.length === 1) {
    return `Environmental alert: ${warnings[0]}`;
  }
  
  return `Multiple alerts: ${warnings.join(', ')}`;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
