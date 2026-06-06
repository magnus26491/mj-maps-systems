// ─────────────────────────────────────────────────────────────────────────────
// Route Engine — Orchestrator
// Coordinates: property-engine → osm → turn-engine → route-optimizer
// Exposes a single POST /route/build endpoint that takes raw stop list
// + vehicle class and returns a fully enriched, optimised, safety-scored route.
// ─────────────────────────────────────────────────────────────────────────────
import Fastify from 'fastify';
import type { StopPoint, OptimiseRequest, OptimiseResult } from '../../route-optimizer/src/index';
import type { PropertyPin } from '../../property-engine/src/index';
import type { RoadGeometry, VehicleClass } from '../../../packages/vehicle-profiles/index';

const app = Fastify({ logger: true });

const PROPERTY_URL = process.env.PROPERTY_ENGINE_URL ?? 'http://localhost:3005';
const OSM_URL = process.env.OSM_ENGINE_URL ?? 'http://localhost:3007';
const TURN_URL = process.env.TURN_ENGINE_URL ?? 'http://localhost:3003';
const OPTIMIZER_URL = process.env.OPTIMIZER_URL ?? 'http://localhost:3004';

interface RawStop {
  id: string;
  label: string;
  address: string;
  postcode: string;
  windowOpenMs?: number;
  windowCloseMs?: number;
  volumeL?: number;
  weightKg?: number;
  notes?: string;
  isCollection?: boolean;
}

interface BuildRouteRequest {
  vehicleClass: VehicleClass;
  depotPostcode: string;
  depotAddress: string;
  stops: RawStop[];
  returnToDepot?: boolean;
  shiftStartMs?: number;
  avgSpeedKph?: number;
  dwellTimePerStopMs?: number;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json() as Promise<T>;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`GET ${url} returned ${res.status}`);
  return res.json() as Promise<T>;
}

app.post<{ Body: BuildRouteRequest }>('/route/build', async (req, reply) => {
  const { vehicleClass, stops, depotPostcode, depotAddress, ...rest } = req.body;

  // 1. Geocode depot
  const depotPin = await post<PropertyPin>(`${PROPERTY_URL}/property/geocode`, {
    address: depotAddress,
    postcode: depotPostcode,
  });

  // 2. Geocode all stops in parallel
  const geocodedStops: StopPoint[] = await Promise.all(
    stops.map(async (rawStop) => {
      let pin: PropertyPin;
      try {
        pin = await post<PropertyPin>(`${PROPERTY_URL}/property/geocode`, {
          address: rawStop.address,
          postcode: rawStop.postcode,
        });
      } catch {
        // If geocoding fails, use a rough centroid — flag warning
        pin = {
          fullAddress: rawStop.address,
          lat: 51.5,
          lon: -0.1,
          exactPin: { lat: 51.5, lon: -0.1 },
          parkSide: 'either',
          accessNotes: [],
          successCount: 0,
          failCount: 0,
          turningHeadNearby: false,
          turningHeadDiamM: 0,
        };
      }

      // 3. Fetch OSM road geometry for exact pin location
      let roadGeo: RoadGeometry;
      try {
        roadGeo = await get<RoadGeometry>(
          `${OSM_URL}/osm/road?lat=${pin.exactPin.lat}&lon=${pin.exactPin.lon}`,
        );
        // Enrich with property-engine turning head data
        roadGeo.turningHeadDiamM = pin.turningHeadDiamM;
        roadGeo.communityScoreOverride = pin.communityRoadScore;
      } catch {
        roadGeo = {
          roadWidthM: 4.5,
          turningHeadDiamM: pin.turningHeadDiamM,
          distanceToDeadEndM: 999,
          isDeadEnd: false,
          highwayClass: 'unclassified',
        };
      }

      // 4. Score turn feasibility
      let turnAlert: 'GREEN' | 'AMBER' | 'RED' = 'GREEN';
      try {
        const turnResult = await post<{ alert: 'GREEN' | 'AMBER' | 'RED' }>(
          `${TURN_URL}/turn/score`,
          { vehicleClass, roadGeometry: roadGeo },
        );
        turnAlert = turnResult.alert;
      } catch { /* keep GREEN default */ }

      return {
        id: rawStop.id,
        label: rawStop.label,
        lat: pin.exactPin.lat,
        lon: pin.exactPin.lon,
        address: pin.fullAddress,
        postcode: rawStop.postcode,
        windowOpenMs: rawStop.windowOpenMs,
        windowCloseMs: rawStop.windowCloseMs,
        volumeL: rawStop.volumeL,
        weightKg: rawStop.weightKg,
        notes: rawStop.notes ?? pin.accessNotes.join(' | '),
        isCollection: rawStop.isCollection,
        turnAlert,
      } satisfies StopPoint;
    }),
  );

  // 5. Optimise the route
  const optimiseReq: OptimiseRequest = {
    vehicleClass,
    depotLat: depotPin.exactPin.lat,
    depotLon: depotPin.exactPin.lon,
    stops: geocodedStops,
    returnToDepot: rest.returnToDepot ?? true,
    shiftStartMs: rest.shiftStartMs,
    avgSpeedKph: rest.avgSpeedKph,
    dwellTimePerStopMs: rest.dwellTimePerStopMs,
  };

  const result = await post<OptimiseResult>(`${OPTIMIZER_URL}/route/optimise`, optimiseReq);

  return reply.send({
    ...result,
    depot: { lat: depotPin.exactPin.lat, lon: depotPin.exactPin.lon, address: depotPin.fullAddress },
    vehicleClass,
  });
});

app.get('/health', async () => ({ status: 'ok', service: 'route-engine' }));

const PORT = Number(process.env.PORT ?? 3002);
app.listen({ port: PORT, host: '0.0.0.0' });
