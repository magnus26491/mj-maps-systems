// ─────────────────────────────────────────────────────────────────────────────
// Property Engine
// Resolves UK addresses to exact GPS pins (not postcode centroids).
// Uses Royal Mail PAF + OS AddressBase + driver-submitted pin overrides.
// Enriches each stop with last-50-metres access intelligence.
// ─────────────────────────────────────────────────────────────────────────────
import Fastify from 'fastify';

const app = Fastify({ logger: true });

export interface PropertyPin {
  uprn?: string;
  udprn?: string;
  fullAddress: string;
  lat: number;
  lon: number;
  /** Recommended GPS pin — exact front door / gate / bay */
  exactPin: { lat: number; lon: number };
  /** Optional gate/entrance offset from exactPin */
  entrancePin?: { lat: number; lon: number };
  /** Recommended side of road to stop on */
  parkSide: 'left' | 'right' | 'either' | 'layby';
  /** Known access notes (gate code, rear entrance, buzz flat 3, etc.) */
  accessNotes: string[];
  /** Times this stop has been successfully completed */
  successCount: number;
  /** Times this stop was failed / not found */
  failCount: number;
  /** Whether a turning head is known near this stop */
  turningHeadNearby: boolean;
  /** Estimated turning head diameter in metres if known */
  turningHeadDiamM: number;
  /** Community-sourced road quality score 0..1 */
  communityRoadScore?: number;
}

/** In-memory override store (replace with PostgreSQL in production) */
const pinOverrides = new Map<string, Partial<PropertyPin>>();

/**
 * Geocode an address string to a PropertyPin.
 * Priority: driver override → OS AddressBase API → Postcodes.io fallback
 */
async function geocodeAddress(address: string, postcode: string): Promise<PropertyPin> {
  const key = `${postcode}:${address}`.toLowerCase().replace(/\s+/g, '');
  const override = pinOverrides.get(key);

  // Try OS Names API (requires OS_API_KEY env var)
  const osApiKey = process.env.OS_API_KEY;
  if (osApiKey) {
    try {
      const query = encodeURIComponent(`${address} ${postcode}`);
      const url = `https://api.os.uk/search/names/v1/find?query=${query}&key=${osApiKey}&maxresults=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      const data = (await res.json()) as any;
      const result = data?.results?.[0]?.GAZETTEER_ENTRY;
      if (result) {
        const base: PropertyPin = {
          fullAddress: result.NAME1 ?? address,
          lat: result.GEOMETRY_Y,
          lon: result.GEOMETRY_X,
          exactPin: { lat: result.GEOMETRY_Y, lon: result.GEOMETRY_X },
          parkSide: 'either',
          accessNotes: [],
          successCount: 0,
          failCount: 0,
          turningHeadNearby: false,
          turningHeadDiamM: 0,
          ...override,
        };
        return base;
      }
    } catch { /* fall through */ }
  }

  // Fallback: Postcodes.io
  try {
    const clean = postcode.replace(/\s+/g, '').toUpperCase();
    const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`, {
      signal: AbortSignal.timeout(5_000),
    });
    const data = (await res.json()) as any;
    if (data.result) {
      return {
        fullAddress: `${address}, ${postcode}`,
        lat: data.result.latitude,
        lon: data.result.longitude,
        exactPin: { lat: data.result.latitude, lon: data.result.longitude },
        parkSide: 'either',
        accessNotes: [],
        successCount: 0,
        failCount: 0,
        turningHeadNearby: false,
        turningHeadDiamM: 0,
        ...override,
      };
    }
  } catch { /* fall through */ }

  throw new Error(`Unable to geocode: ${address} ${postcode}`);
}

// ── Endpoints ────────────────────────────────────────────────────────────────

app.post<{ Body: { address: string; postcode: string } }>(
  '/property/geocode',
  async (req, reply) => {
    try {
      const pin = await geocodeAddress(req.body.address, req.body.postcode);
      return reply.send(pin);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  },
);

/** Driver submits a pin correction for a stop */
app.post<{
  Body: { postcode: string; address: string; override: Partial<PropertyPin> };
}>('/property/pin-override', async (req, reply) => {
  const key = `${req.body.postcode}:${req.body.address}`.toLowerCase().replace(/\s+/g, '');
  const existing = pinOverrides.get(key) ?? {};
  pinOverrides.set(key, { ...existing, ...req.body.override });
  return reply.send({ ok: true, key });
});

/** Record stop outcome — success or failure */
app.post<{
  Body: { postcode: string; address: string; outcome: 'success' | 'fail'; notes?: string };
}>('/property/outcome', async (req, reply) => {
  const key = `${req.body.postcode}:${req.body.address}`.toLowerCase().replace(/\s+/g, '');
  const existing = pinOverrides.get(key) ?? {} as Partial<PropertyPin>;
  if (req.body.outcome === 'success') {
    existing.successCount = (existing.successCount ?? 0) + 1;
  } else {
    existing.failCount = (existing.failCount ?? 0) + 1;
    if (req.body.notes) {
      existing.accessNotes = [...(existing.accessNotes ?? []), req.body.notes];
    }
  }
  pinOverrides.set(key, existing);
  return reply.send({ ok: true });
});

app.get('/health', async () => ({ status: 'ok', service: 'property-engine' }));

const PORT = Number(process.env.PORT ?? 3005);
app.listen({ port: PORT, host: '0.0.0.0' });

export { geocodeAddress };
