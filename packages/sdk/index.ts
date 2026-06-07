/**
 * MJ Maps Systems — B2B SDK
 *
 * For courier companies, logistics platforms, and third-party apps
 * that want to embed MJ Maps routing intelligence into their own products.
 *
 * What the SDK provides:
 *   • Route optimisation (geographic + traffic-weighted)
 *   • Stop enrichment (turn warnings, road width, access notes)
 *   • Postcode resolution (scanner workflow ready)
 *   • Vehicle profiles
 *   • Webhooks for delivery events
 *   • White-label token (removes MJ Maps branding)
 *
 * Pricing: Enterprise plan only. REST API + this typed SDK client.
 *
 * Usage:
 *   import { MJMapsClient } from '@mj-maps/sdk';
 *   const client = new MJMapsClient({ apiKey: 'YOUR_KEY' });
 *   const route  = await client.routes.optimise({ stops, vehicleId, shiftStartISO });
 */

export interface MJMapsClientConfig {
  apiKey:    string;
  baseUrl?:  string;  // defaults to https://api.mjmaps.co.uk/v1
  timeout?:  number;  // ms, default 30_000
}

export interface StopInput {
  id:          string;
  postcode?:   string;
  address?:    string;
  lat?:        number;
  lng?:        number;
  parcelCount?: number;
  weightKg?:   number;
  requiresSig?: boolean;
  accessNotes?: string;
  timeWindowStart?: string; // ISO
  timeWindowEnd?:   string; // ISO
}

export interface OptimiseRouteInput {
  stops:          StopInput[];
  vehicleId:      string;  // from VEHICLE_PROFILES
  shiftStartISO:  string;
  depotLat?:      number;
  depotLng?:      number;
  maxShiftHours?: number;
  trafficAware?:  boolean;  // default true
  avoidSchoolRuns?: boolean; // default true
}

export interface OptimisedRoute {
  stops:              EnrichedStopOutput[];
  totalDistanceKm:    number;
  estimatedDurationMin: number;
  trafficSavingMin:   number;
  droppedStops:       StopInput[];  // vehicle constraint failures
}

export interface EnrichedStopOutput {
  id:          string;
  seq:         number;
  address:     string;
  postcode:    string;
  lat:         number;
  lng:         number;
  plusCode:    string;
  eta:         string;  // ISO
  turnLevel:   'GREEN' | 'AMBER' | 'RED';
  roadWidthM?: number;
  accessNotes?: string;
  travelTimeSec: number;
}

export interface WebhookConfig {
  url:    string;
  events: WebhookEvent[];
  secret: string;  // HMAC-SHA256 signing secret
}

export type WebhookEvent =
  | 'stop.completed'
  | 'stop.failed'
  | 'shift.started'
  | 'shift.completed'
  | 'route.replanned'
  | 'pin.confirmed';

class RoutesAPI {
  constructor(private http: HTTPClient) {}

  async optimise(input: OptimiseRouteInput): Promise<OptimisedRoute> {
    return this.http.post('/routes/optimise', input);
  }

  async resolve(postcode: string): Promise<EnrichedStopOutput[]> {
    return this.http.get(`/routes/resolve?postcode=${encodeURIComponent(postcode)}`);
  }
}

class DriversAPI {
  constructor(private http: HTTPClient) {}

  async list(): Promise<Driver[]> {
    return this.http.get('/drivers');
  }

  async create(input: { name: string; email: string; vehicleId?: string }): Promise<Driver> {
    return this.http.post('/drivers', input);
  }

  async currentShift(driverId: string): Promise<OptimisedRoute | null> {
    return this.http.get(`/drivers/${driverId}/shift`);
  }
}

class WebhooksAPI {
  constructor(private http: HTTPClient) {}

  async register(config: WebhookConfig): Promise<{ id: string }> {
    return this.http.post('/webhooks', config);
  }

  async list(): Promise<(WebhookConfig & { id: string })[]> {
    return this.http.get('/webhooks');
  }

  async delete(id: string): Promise<void> {
    return this.http.delete(`/webhooks/${id}`);
  }
}

export class MJMapsClient {
  public routes:   RoutesAPI;
  public drivers:  DriversAPI;
  public webhooks: WebhooksAPI;

  private http: HTTPClient;

  constructor(config: MJMapsClientConfig) {
    this.http     = new HTTPClient(config);
    this.routes   = new RoutesAPI(this.http);
    this.drivers  = new DriversAPI(this.http);
    this.webhooks = new WebhooksAPI(this.http);
  }
}

class HTTPClient {
  private baseUrl: string;
  private apiKey:  string;
  private timeout: number;

  constructor(config: MJMapsClientConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.mjmaps.co.uk/v1';
    this.apiKey  = config.apiKey;
    this.timeout = config.timeout ?? 30_000;
  }

  async get<T>(path: string): Promise<T> {
    return this.request('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request('POST', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new MJMapsAPIError(res.status, err.message ?? res.statusText, err);
      }

      return res.json() as Promise<T>;
    } finally {
      clearTimeout(tid);
    }
  }
}

export class MJMapsAPIError extends Error {
  constructor(
    public status:  number,
    message:         string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'MJMapsAPIError';
  }
}

interface Driver {
  id: string;
  name: string;
  email: string;
  vehicleId?: string;
  createdAt: string;
}
