/**
 * Weather Intelligence Service
 * 
 * Integrates weather data to adjust delivery confidence.
 * 
 * Never shows raw weather data to drivers.
 * Only adjusts confidence and provides delivery-friendly warnings.
 */

export interface WeatherCondition {
  condition: WeatherType;
  severity: 'none' | 'light' | 'moderate' | 'heavy' | 'severe';
  temperature?: number;  // Celsius
  visibility?: number;   // metres
  windSpeed?: number;    // km/h
  precipitation?: number; // mm/h
  location: GeoCoord;
  timestamp: string;
  source: WeatherSource;
}

export type WeatherType = 
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'heavy_rain'
  | 'thunderstorm'
  | 'snow'
  | 'sleet'
  | 'fog'
  | 'wind'
  | 'ice'
  | 'flooding';

export type WeatherSource = 'met_office' | 'openweather' | 'internal';

export interface GeoCoord {
  lat: number;
  lng: number;
}

export interface WeatherImpact {
  condition: WeatherCondition;
  deliveryImpact: 'minimal' | 'moderate' | 'significant';
  confidenceAdjustment: number;
  warnings: string[];
  recommendations: string[];
}

// ─── Weather Impact Assessment ───────────────────────────────────────────────────

/**
 * Assess weather impact on delivery
 */
export function assessWeatherImpact(
  weather: WeatherCondition,
  deliveryType: 'parcel' | 'pallet' | 'fragile' = 'parcel'
): WeatherImpact {
  let confidenceAdjustment = 0;
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  let deliveryImpact: WeatherImpact['deliveryImpact'] = 'minimal';

  // Rain impact
  if (weather.condition === 'rain' || weather.condition === 'heavy_rain') {
    deliveryImpact = 'moderate';
    confidenceAdjustment -= 0.1;
    warnings.push('Rain expected');
    recommendations.push('Allow extra time for delivery');
    
    if (weather.condition === 'heavy_rain') {
      deliveryImpact = 'significant';
      confidenceAdjustment -= 0.15;
      warnings.push('Heavy rain - reduced visibility');
      recommendations.push('Drive carefully, allow extra time');
    }
  }

  // Snow impact
  if (weather.condition === 'snow') {
    deliveryImpact = 'significant';
    confidenceAdjustment -= 0.25;
    warnings.push('Snow expected');
    recommendations.push('Plan for slower travel times');
  }

  // Ice impact
  if (weather.condition === 'ice') {
    deliveryImpact = 'significant';
    confidenceAdjustment -= 0.3;
    warnings.push('Icy conditions');
    recommendations.push('Drive slowly, allow extra time');
  }

  // Fog impact
  if (weather.condition === 'fog') {
    deliveryImpact = 'moderate';
    confidenceAdjustment -= 0.15;
    warnings.push('Foggy conditions');
    
    if (weather.visibility && weather.visibility < 1000) {
      confidenceAdjustment -= 0.1;
      warnings.push('Reduced visibility');
    }
  }

  // Wind impact
  if (weather.condition === 'wind' && weather.windSpeed) {
    if (weather.windSpeed > 50) {
      deliveryImpact = 'moderate';
      confidenceAdjustment -= 0.1;
      warnings.push('Strong winds');
    }
  }

  // Flooding
  if (weather.condition === 'flooding') {
    deliveryImpact = 'significant';
    confidenceAdjustment -= 0.35;
    warnings.push('Flooding in area');
    recommendations.push('Check route before departure');
  }

  // Temperature impact
  if (weather.temperature !== undefined) {
    if (weather.temperature < -5) {
      confidenceAdjustment -= 0.1;
      warnings.push('Very cold conditions');
    }
    if (weather.temperature > 35) {
      confidenceAdjustment -= 0.05;
      warnings.push('Extreme heat - stay hydrated');
    }
  }

  // Adjust for delivery type
  if (deliveryType === 'fragile' && (weather.condition === 'rain' || weather.condition === 'snow')) {
    confidenceAdjustment -= 0.1;
    recommendations.push('Protect fragile items from weather');
  }

  // Cap confidence adjustment
  confidenceAdjustment = Math.max(-0.5, Math.min(0, confidenceAdjustment));

  return {
    condition: weather,
    deliveryImpact,
    confidenceAdjustment,
    warnings,
    recommendations,
  };
}

/**
 * Format weather warning for driver HUD
 * 
 * Never shows raw data - only what the driver needs to know
 */
export function formatWeatherWarning(impact: WeatherImpact): {
  shouldShow: boolean;
  title: string;
  message: string;
  urgency: 'low' | 'medium' | 'high';
} {
  if (impact.deliveryImpact === 'minimal' || impact.warnings.length === 0) {
    return { shouldShow: false, title: '', message: '', urgency: 'low' };
  }

  // Show only the most important warning
  const primaryWarning = impact.warnings[0];
  
  let urgency: 'low' | 'medium' | 'high' = 'low';
  let title = '🌤️ Weather';
  let message = primaryWarning;

  if (impact.condition.condition === 'snow' || impact.condition.condition === 'ice') {
    urgency = 'high';
    title = '❄️ Winter conditions';
    message = 'Allow extra time, drive carefully';
  } else if (impact.condition.condition === 'thunderstorm' || impact.condition.condition === 'flooding') {
    urgency = 'high';
    title = '⚠️ Severe weather';
    message = 'Check route before departure';
  } else if (impact.condition.condition === 'rain' || impact.condition.condition === 'heavy_rain') {
    urgency = 'medium';
    title = '🌧️ Rain expected';
    message = 'Allow extra time for delivery';
  } else if (impact.condition.condition === 'fog') {
    urgency = 'medium';
    title = '🌫️ Fog expected';
    message = 'Reduced visibility';
  }

  return {
    shouldShow: true,
    title,
    message,
    urgency,
  };
}

/**
 * Adjust delivery confidence based on weather
 */
export function adjustConfidenceForWeather(
  baseConfidence: number,
  weatherImpact: WeatherImpact
): number {
  const adjusted = baseConfidence + weatherImpact.confidenceAdjustment;
  
  // Confidence is 0-1
  return Math.max(0, Math.min(1, adjusted));
}

/**
 * Get weather-related parking advice
 */
export function getParkingAdvice(weather: WeatherCondition): string | null {
  if (weather.condition === 'rain' || weather.condition === 'heavy_rain') {
    return 'Undercover parking recommended if available';
  }
  
  if (weather.condition === 'snow' || weather.condition === 'ice') {
    return 'Consider parking away from slopes';
  }
  
  if (weather.condition === 'wind' && weather.windSpeed && weather.windSpeed > 50) {
    return 'Avoid parking under trees';
  }
  
  return null;
}

/**
 * Get delivery timing advice based on weather
 */
export function getTimingAdvice(weather: WeatherCondition): string | null {
  if (weather.condition === 'rain' || weather.condition === 'heavy_rain') {
    return 'Morning deliveries may be better';
  }
  
  if (weather.condition === 'snow' || weather.condition === 'ice') {
    return 'Midday deliveries recommended - roads clearer';
  }
  
  if (weather.condition === 'fog') {
    return 'Allow extra travel time';
  }
  
  return null;
}
