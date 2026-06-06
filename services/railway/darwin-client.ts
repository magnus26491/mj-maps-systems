/**
 * MJ Maps Systems — National Rail Darwin API Client
 * Provides real-time train running data for level crossing delay predictions
 *
 * Darwin is the National Rail data feed, available free via the
 * National Rail Open Data portal: https://opendata.nationalrail.co.uk
 *
 * Upgrade from probabilistic model (Phase 1) to real-time predictions (Phase 2)
 */

// ─── TYPES ────────────────────────────────────────────────────────────────

export interface TrainService {
  serviceId: string;
  operator: string;
  /** Scheduled time at nearest station (HH:MM) */
  scheduledTime: string;
  /** Estimated time (HH:MM) — may differ due to delays */
  estimatedTime: string;
  isDelayed: boolean;
  delayMinutes: number;
  isCancelled: boolean;
}

export interface CrossingPrediction {
  crossingId: string;
  crossingName: string;
  lat: number;
  lng: number;
  /** Next predicted closure start (ISO timestamp) */
  nextClosureAt: string | null;
  /** Predicted closure duration in seconds */
  predictedClosureSec: number;
  /** Confidence: HIGH (live Darwin data) | MEDIUM (schedule only) | LOW (probabilistic) */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** All train services crossing in the next 60 minutes */
  upcomingServices: TrainService[];
  /** Expected wait if driver arrives now (seconds) */
  expectedWaitSec: number;
}

// ─── DARWIN API CLIENT ────────────────────────────────────────────────────

const DARWIN_API_BASE = 'https://api.rtt.io/api/v1'; // Real-Time Trains API (Darwin wrapper)

/**
 * Get upcoming train services passing through a station near a level crossing.
 * Uses Real-Time Trains API (free tier: 1 req/sec, 500 req/day — sufficient for Phase 2)
 *
 * For production: upgrade to OpenLDBWS (National Rail SOAP API) for full Darwin access
 * or use the RTT paid tier for higher rate limits.
 */
export async function getUpcomingServices(params: {
  stationCrs: string;   // 3-letter CRS code of nearest station, e.g. 'EUS' = Euston
  lookaheadMinutes?: number;
}): Promise<TrainService[]> {
  const { stationCrs, lookaheadMinutes = 60 } = params;
  const url = `${DARWIN_API_BASE}/json/search/${stationCrs}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${process.env.RTT_API_USER}:${process.env.RTT_API_PASS}`
      ).toString('base64')}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Darwin API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const now = new Date();
  const cutoff = new Date(now.getTime() + lookaheadMinutes * 60_000);

  return (data.services ?? []).map((svc: any) => {
    const scheduledTime = svc.locationDetail?.gbttBookedDeparture ?? svc.locationDetail?.gbttBookedArrival ?? '0000';
    const estimatedTime = svc.locationDetail?.realtimeDeparture ?? scheduledTime;
    const scheduled = parseTime(scheduledTime);
    const estimated = parseTime(estimatedTime);
    const delayMinutes = Math.max(0, (estimated.getTime() - scheduled.getTime()) / 60_000);

    return {
      serviceId: svc.serviceUid,
      operator: svc.atocName ?? 'Unknown',
      scheduledTime,
      estimatedTime,
      isDelayed: delayMinutes > 2,
      delayMinutes,
      isCancelled: svc.locationDetail?.cancelReasonCode != null,
    } satisfies TrainService;
  }).filter((svc: TrainService) => {
    const t = parseTime(svc.estimatedTime);
    return t >= now && t <= cutoff && !svc.isCancelled;
  });
}

/**
 * Predict crossing closure for a driver arriving at a given time.
 * Maps a level crossing to its nearest station CRS code, fetches
 * live services, and estimates whether the crossing will be closed
 * on arrival.
 */
export async function predictCrossingClosure(params: {
  crossingId: string;
  crossingName: string;
  lat: number;
  lng: number;
  nearestStationCrs: string;
  /** Average time from station to crossing (minutes) — varies by line speed */
  stationToCrossingMin: number;
  /** Average closure duration per train (seconds) */
  closureDurationSec: number;
  /** Driver estimated arrival (ISO timestamp) */
  driverArrivalAt: string;
}): Promise<CrossingPrediction> {
  const {
    crossingId, crossingName, lat, lng,
    nearestStationCrs, stationToCrossingMin,
    closureDurationSec, driverArrivalAt,
  } = params;

  let services: TrainService[] = [];
  let confidence: CrossingPrediction['confidence'] = 'LOW';

  try {
    services = await getUpcomingServices({ stationCrs: nearestStationCrs, lookaheadMinutes: 90 });
    confidence = services.length > 0 ? 'HIGH' : 'MEDIUM';
  } catch {
    // Fallback to probabilistic model if Darwin is unavailable
    confidence = 'LOW';
  }

  const driverArrival = new Date(driverArrivalAt);

  // Find services that will be at the crossing when driver arrives
  const crossingClosures = services
    .map(svc => {
      const trainAtCrossing = new Date(
        parseTime(svc.estimatedTime).getTime() + stationToCrossingMin * 60_000
      );
      const closureStart = new Date(trainAtCrossing.getTime() - 60_000); // 60s before train
      const closureEnd   = new Date(trainAtCrossing.getTime() + closureDurationSec * 1000);
      return { svc, closureStart, closureEnd };
    })
    .filter(({ closureStart, closureEnd }) =>
      driverArrival >= closureStart && driverArrival <= closureEnd
    );

  const expectedWaitSec = crossingClosures.length > 0
    ? crossingClosures.reduce((max, { closureEnd }) =>
        Math.max(max, (closureEnd.getTime() - driverArrival.getTime()) / 1000), 0)
    : 0;

  const nextClosure = services
    .map(svc => new Date(
      parseTime(svc.estimatedTime).getTime() + stationToCrossingMin * 60_000 - 60_000
    ))
    .filter(d => d > new Date())
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  return {
    crossingId,
    crossingName,
    lat,
    lng,
    nextClosureAt: nextClosure?.toISOString() ?? null,
    predictedClosureSec: closureDurationSec,
    confidence,
    upcomingServices: services,
    expectedWaitSec,
  };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────

function parseTime(hhmm: string): Date {
  const h = parseInt(hhmm.slice(0, 2), 10);
  const m = parseInt(hhmm.slice(2, 4), 10);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
}
