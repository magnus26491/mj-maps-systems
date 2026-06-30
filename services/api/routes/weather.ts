/**
 * GET /api/v1/driver/weather?lat=&lng=
 * Proxies Open-Meteo (free, no API key) and adds driving-risk classification.
 * Cache: Redis 1hr per 1-decimal-place cell (~11km grid).
 * Auth: requireAuth (driver JWT).
 */
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { redis } from '../../cache/index.js';

// WMO weather interpretation codes → driving risk level
function classifyWeatherCode(code: number): 'GREEN' | 'AMBER' | 'RED' {
  if ([45, 48].includes(code)) return 'RED';                       // fog, rime fog
  if ([66, 67, 56, 57].includes(code)) return 'RED';              // freezing rain
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'RED';     // snow / snow grains / snow showers
  if ([95, 96, 99].includes(code)) return 'RED';                  // thunderstorm
  if ([61, 63, 65, 80, 81, 82].includes(code)) return 'AMBER';   // rain / rain showers
  if ([51, 53, 55].includes(code)) return 'AMBER';               // drizzle
  return 'GREEN';
}

function classifyWind(gustMph: number): 'GREEN' | 'AMBER' | 'RED' {
  if (gustMph >= 70) return 'RED';
  if (gustMph >= 50) return 'AMBER';
  return 'GREEN';
}

function worstOf(...levels: ('GREEN' | 'AMBER' | 'RED')[]): 'GREEN' | 'AMBER' | 'RED' {
  if (levels.includes('RED')) return 'RED';
  if (levels.includes('AMBER')) return 'AMBER';
  return 'GREEN';
}

function describeWeatherCode(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Freezing fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    56: 'Light freezing drizzle', 57: 'Heavy freezing drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    66: 'Light freezing rain', 67: 'Heavy freezing rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Slight showers', 81: 'Moderate showers', 82: 'Heavy showers',
    85: 'Slight snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
  };
  return descriptions[code] ?? `Code ${code}`;
}

export async function weatherRoutes(server: FastifyInstance): Promise<void> {
  server.get(
    '/api/v1/driver/weather',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { lat, lng } = request.query as { lat?: string; lng?: string };
      const latN = parseFloat(lat ?? '');
      const lngN = parseFloat(lng ?? '');

      if (isNaN(latN) || isNaN(lngN)) {
        return reply.code(400).send({ ok: false, error: 'lat and lng are required' });
      }

      // Cache key: round to 1 decimal place (~11km) to share cache across nearby drivers
      const cell = `${latN.toFixed(1)},${lngN.toFixed(1)}`;
      const cacheKey = `weather:${cell}`;

      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) {
        return reply.send({ ok: true, data: JSON.parse(cached), cached: true });
      }

      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', latN.toFixed(4));
      url.searchParams.set('longitude', lngN.toFixed(4));
      url.searchParams.set('current', [
        'temperature_2m',
        'weathercode',
        'windspeed_10m',
        'windgusts_10m',
        'precipitation',
        'is_day',
      ].join(','));
      url.searchParams.set('windspeed_unit', 'mph');
      url.searchParams.set('forecast_days', '1');

      let raw: any;
      try {
        const res = await fetch(url.toString(), {
          signal: AbortSignal.timeout(6000),
          headers: { 'User-Agent': 'MJ-Maps/1.0 (driver-weather-proxy)' },
        });
        if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
        raw = await res.json();
      } catch (err) {
        server.log.warn({ err }, 'weather: Open-Meteo fetch failed');
        return reply.code(503).send({ ok: false, error: 'Weather service temporarily unavailable' });
      }

      const c = raw.current;
      const weatherCode: number = c.weathercode ?? 0;
      const tempC: number = c.temperature_2m ?? 0;
      const windMph: number = c.windspeed_10m ?? 0;
      const gustMph: number = c.windgusts_10m ?? 0;
      const precipMm: number = c.precipitation ?? 0;
      const isDay: boolean = c.is_day === 1;

      const weatherRisk = classifyWeatherCode(weatherCode);
      const windRisk = classifyWind(gustMph);
      const overallRisk = worstOf(weatherRisk, windRisk);

      let drivingAdvice = '';
      if (overallRisk === 'RED') {
        drivingAdvice = 'Severe conditions — allow extra time and drive with caution.';
      } else if (overallRisk === 'AMBER') {
        drivingAdvice = 'Adverse conditions — reduce speed and increase following distance.';
      } else {
        drivingAdvice = 'Conditions are good for driving.';
      }

      const data = {
        tempC: Math.round(tempC * 10) / 10,
        description: describeWeatherCode(weatherCode),
        weatherCode,
        windMph: Math.round(windMph),
        gustMph: Math.round(gustMph),
        precipMm: Math.round(precipMm * 10) / 10,
        isDay,
        riskLevel: overallRisk,
        drivingAdvice,
        fetchedAt: new Date().toISOString(),
      };

      await redis.set(cacheKey, JSON.stringify(data), 'EX', 3600).catch(() => {});

      return reply.send({ ok: true, data, cached: false });
    },
  );
}
