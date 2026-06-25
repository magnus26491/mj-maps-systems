/**
 * POST /api/v1/navigate/leg
 * Server-side Geoapify routing for in-app turn-by-turn navigation.
 *
 * Keeps GEOAPIFY_API_KEY off the client (it's in the server's env, not EXPO_PUBLIC_*).
 * Applies vehicle-aware routing using the vehicle profiles package.
 */
import { Router, Request, Response } from 'express';
import { VEHICLE_PROFILES, getGeoapifyMode, type VehicleId } from '../../packages/vehicle-profiles/index.js';

export const navigateRouter = Router();

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

navigateRouter.post('/leg', async (req: Request, res: Response) => {
  const { fromLat, fromLng, toLat, toLng, vehicleId } = req.body as {
    fromLat?: number;
    fromLng?: number;
    toLat?: number;
    toLng?: number;
    vehicleId?: string;
  };

  // Validate coordinates
  if (
    !isFinite(fromLat ?? NaN) || !isFinite(fromLng ?? NaN) ||
    !isFinite(toLat ?? NaN) || !isFinite(toLng ?? NaN) ||
    Math.abs(fromLat ?? 0) > 90 || Math.abs(toLat ?? 0) > 90 ||
    Math.abs(fromLng ?? 0) > 180 || Math.abs(toLng ?? 0) > 180
  ) {
    res.status(400).json({ ok: false, error: 'Invalid coordinates' });
    return;
  }

  if (!vehicleId) {
    res.status(400).json({ ok: false, error: 'vehicleId is required' });
    return;
  }

  // Look up vehicle profile and derive Geoapify mode
  const profileKey = vehicleId.toLowerCase().replace(/\s+/g, '_');
  const profile = VEHICLE_PROFILES[profileKey as VehicleId];
  const geoapifyMode = profile ? getGeoapifyMode(profile) : 'drive';

  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) {
    res.status(503).json({ ok: false, error: 'Routing service not configured' });
    return;
  }

  const url = `https://router.geoapify.com/v1/routing`
    + `?waypoints=${fromLat},${fromLng}|${toLat},${toLng}`
    + `&mode=${geoapifyMode}&format=json&apiKey=${key}`;

  let json: any;
  try {
    const geoRes = await fetch(url);
    if (!geoRes.ok) throw new Error(`Geoapify ${geoRes.status}`);
    json = await geoRes.json();
  } catch (err) {
    console.error('[navigate/leg] Geoapify error:', err);
    res.status(502).json({ ok: false, error: 'Failed to fetch route' });
    return;
  }

  const feature = json?.features?.[0];
  if (!feature) {
    res.json({ ok: false, error: 'No route found' });
    return;
  }

  const props = feature.properties ?? {};
  const steps = (props.legs?.[0]?.steps ?? []).map((s: any) => ({
    instruction:  s.instruction?.text ?? s.maneuver?.instruction ?? '',
    distanceM:    s.distance ?? 0,
    durationSec:  s.time ?? 0,
    bearing:      s.bearing_after ?? 0,
    maneuver:     normalizeManeuver(s.instruction?.type ?? s.maneuver?.type),
  }));

  const coords = feature.geometry?.coordinates ?? [];
  const polyline = coords.map(([lng, lat]: [number, number]) => ({ lat, lng }));

  res.json({
    ok: true,
    data: {
      steps,
      totalDistanceM:    props.distance ?? 0,
      totalDurationSec:  props.time ?? 0,
      polyline,
    },
  });
});
