/**
 * MJ Maps Systems — Stop Intelligence
 *
 * Merges all data sources into a single StopIntelligence object per stop.
 * This is the canonical object the driver app renders at each stop.
 *
 * Merges:
 *  - ApartmentResult      (floor, lift, entrance GPS, intercom)
 *  - TurnAlertResult      (vehicle turn feasibility, road width)
 *  - RoadSuitability      (road class, width, restrictions)
 *  - Community reports    (driver-submitted notes)
 *  - Parcel metadata      (weight, oversize, count)
 *
 * Output:
 *  - Single notification string (primary)
 *  - Structured fields for app UI rendering
 *  - Difficulty score 1–5
 *  - Suggested GPS pin (entrance-level, not postcode centroid)
 *  - Action flags: needsTurnAround, liftConfirmed, intercomePresent, etc.
 */

import { analyseApartment, type ApartmentAddress, type ApartmentResult } from './apartment-engine';
import { computeTurnScore, getTurnAlert, VEHICLE_PROFILES, type TurnAlertLevel } from '../../packages/vehicle-profiles/index';
import { getBuildingContext } from '../osm/building-query';
import { CacheKey, type MJMapsCache } from '../cache/redis-cache';

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface ParcelInfo {
  count: number;
  totalWeightKg: number;
  isOversize: boolean;
  requiresSignature: boolean;
}

export interface RoadApproach {
  /** OSM way ID of the road leading to the stop */
  osmWayId: number | null;
  roadWidthM: number | null;
  /** road class: residential | service | unclassified | tertiary | secondary | primary */
  roadClass: string | null;
  /** Is it a dead-end / cul-de-sac? */
  isDeadEnd: boolean;
  /** Is there a turning head / turning circle? */
  hasTurningHead: boolean;
  /** One-way restriction */
  isOneWay: boolean;
  /** Max vehicle weight restriction (tonnes) */
  maxWeightT: number | null;
  /** Max vehicle height restriction (metres) */
  maxHeightM: number | null;
}

export interface CommunityNote {
  note: string;
  reportedByDriverId: string;
  createdAt: number; // Unix epoch
  thumbsUp: number;
}

export interface StopIntelligence {
  stopId: string;

  // ── GPS ──────────────────────────────────────────────────
  /** Exact entrance/door GPS — NOT postcode centroid */
  pinLat: number;
  pinLng: number;
  /** Whether pin is entrance-level (HIGH) or approximate (LOW) */
  pinAccuracy: 'HIGH' | 'MEDIUM' | 'LOW';

  // ── Apartment ─────────────────────────────────────────────
  isApartment: boolean;
  floor: number | null;
  floorLabel: string | null;
  totalBuildingFloors: number | null;
  liftStatus: ApartmentResult['liftStatus'] | null;
  hasIntercom: boolean;
  allEntrances: ApartmentResult['allEntrances'];

  // ── Vehicle / Road ─────────────────────────────────────────
  turnAlertLevel: TurnAlertLevel;
  turnScore: number;
  canTurnAround: boolean;
  roadWidthM: number | null;
  roadClass: string | null;
  isDeadEnd: boolean;
  hasTurningHead: boolean;
  vehicleMaxWeightOk: boolean;
  vehicleMaxHeightOk: boolean;

  // ── Workload ───────────────────────────────────────────────
  parcel: ParcelInfo;
  floorPenaltyMinutes: number;
  difficultyScore: number;

  // ── Notifications ──────────────────────────────────────────
  /** Primary notification shown on stop card */
  primaryNotification: string;
  /** Ordered list of sub-alerts shown below primary */
  alerts: string[];

  // ── Community ─────────────────────────────────────────────
  communityNotes: CommunityNote[];

  // ── Meta ───────────────────────────────────────────────────
  builtAt: number; // Unix epoch when this intelligence was assembled
  cacheHit: boolean;
}

// ─── INPUT ──────────────────────────────────────────────────────────────────

export interface StopIntelligenceInput {
  stopId: string;
  lat: number;
  lng: number;
  rawAddress: string;
  vehicleId: string;
  parcel: ParcelInfo;
  /** Pre-loaded road approach data (from road query) — pass null to skip */
  roadApproach: RoadApproach | null;
  /** Community notes from DB */
  communityNotes?: CommunityNote[];
  /** Whether the stop is flagged as an apartment/flat */
  isApartment?: boolean;
  /** Optional cache instance — if provided, results are cached 24h */
  cache?: MJMapsCache;
}

// ─── ALERT BUILDER ──────────────────────────────────────────────────────────

function buildAlerts(p: {
  turnAlertLevel: TurnAlertLevel;
  isDeadEnd: boolean;
  hasTurningHead: boolean;
  vehicleMaxWeightOk: boolean;
  vehicleMaxHeightOk: boolean;
  roadWidthM: number | null;
  liftStatus: ApartmentResult['liftStatus'] | null;
  hasIntercom: boolean;
  isApartment: boolean;
  floor: number | null;
  difficultyScore: number;
}): string[] {
  const alerts: string[] = [];

  // Turn / road alerts
  if (p.turnAlertLevel === 'RED') {
    alerts.push('🔴 Do NOT enter — vehicle cannot turn around. Approach from opposite end or park before.');
  } else if (p.turnAlertLevel === 'AMBER') {
    alerts.push('🟡 Tight turning space ahead — consider reversing in.');
  }
  if (p.isDeadEnd && !p.hasTurningHead) {
    alerts.push('🔚 Dead-end road with no turning head — reverse exit required.');
  }
  if (p.hasTurningHead) {
    alerts.push('🔄 Turning head present — forward turn feasible.');
  }
  if (!p.vehicleMaxWeightOk) alerts.push('⚠️ Road has a weight restriction — check before entering.');
  if (!p.vehicleMaxHeightOk) alerts.push('⚠️ Height restriction on approach road.');

  // Apartment alerts
  if (p.isApartment && p.floor !== null && p.floor > 0) {
    if (p.liftStatus === 'CONFIRMED_NO' || p.liftStatus === 'LIKELY_NO') {
      alerts.push(`🚶 No lift — ${p.floor} floor${p.floor > 1 ? 's' : ''} of stairs with parcel.`);
    } else if (p.liftStatus === 'UNKNOWN') {
      alerts.push('❓ Lift status unknown — confirm on arrival.');
    }
  }
  if (p.hasIntercom) alerts.push('🔔 Intercom at entrance — buzz before attempting delivery.');
  if (p.difficultyScore >= 4) alerts.push('⚠️ High-difficulty stop — allow extra time.');

  return alerts;
}

// ─── PRIMARY NOTIFICATION BUILDER ───────────────────────────────────────────

function buildPrimaryNotification(p: {
  rawAddress: string;
  isApartment: boolean;
  floorLabel: string | null;
  liftStatus: ApartmentResult['liftStatus'] | null;
  turnAlertLevel: TurnAlertLevel;
  floorPenaltyMinutes: number;
}): string {
  const parts: string[] = [];

  if (p.turnAlertLevel === 'RED') {
    parts.push('🔴 Turn-around not possible with this vehicle.');
  } else if (p.turnAlertLevel === 'AMBER') {
    parts.push('🟡 Tight turn ahead.');
  }

  if (p.isApartment && p.floorLabel) {
    const liftStr =
      p.liftStatus === 'CONFIRMED_YES' ? '🛗 lift confirmed' :
      p.liftStatus === 'LIKELY_YES'    ? '🛗 lift likely' :
      p.liftStatus === 'CONFIRMED_NO'  ? '🚶 stairs only' :
      p.liftStatus === 'LIKELY_NO'     ? '🚶 stairs likely' : '';
    parts.push(`🏢 ${p.floorLabel}${liftStr ? ` — ${liftStr}` : ''}.`);
  }

  if (p.floorPenaltyMinutes >= 1.5) {
    parts.push(`⏱️ +${p.floorPenaltyMinutes} min service time.`);
  }

  return parts.join(' ') || '✅ Standard stop.';
}

// ─── VEHICLE RESTRICTION CHECK ───────────────────────────────────────────────

function checkVehicleRestrictions(
  vehicleId: string,
  road: RoadApproach | null,
): { weightOk: boolean; heightOk: boolean } {
  const profile = VEHICLE_PROFILES[vehicleId];
  if (!profile || !road) return { weightOk: true, heightOk: true };

  const weightOk = road.maxWeightT == null || profile.maxGrossWeightT <= road.maxWeightT;
  const heightOk = road.maxHeightM == null || profile.heightM <= road.maxHeightM;
  return { weightOk, heightOk };
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Build a complete StopIntelligence object for a single stop.
 * Fetches building context, computes turn score, merges all signals.
 *
 * Results are cached 24h if a cache instance is provided.
 *
 * @example
 * const intel = await buildStopIntelligence({
 *   stopId: 'stop-42',
 *   lat: 51.5074, lng: -0.1278,
 *   rawAddress: 'Flat 305, Tower House, High Street, London',
 *   vehicleId: 'lwb-van',
 *   parcel: { count: 1, totalWeightKg: 4, isOversize: false, requiresSignature: false },
 *   roadApproach: { roadWidthM: 5.5, isDeadEnd: true, hasTurningHead: false, ... },
 *   isApartment: true,
 *   cache,
 * });
 *
 * intel.primaryNotification
 * // "🟡 Tight turn ahead. 🏢 3rd floor — 🛗 lift confirmed. ⏱️ +2.4 min service time."
 *
 * intel.alerts
 * // [ "🟡 Tight turning space — consider reversing in.",
 * //   "🔚 Dead-end road with no turning head — reverse exit required.",
 * //   "🔔 Intercom at entrance — buzz before attempting delivery." ]
 */
export async function buildStopIntelligence(
  input: StopIntelligenceInput,
): Promise<StopIntelligence> {

  // ── Cache lookup ──────────────────────────────────────────
  if (input.cache) {
    const cached = await input.cache.get<StopIntelligence>(CacheKey.stop(input.stopId));
    if (cached) return { ...cached, cacheHit: true };
  }

  // ── Apartment analysis ────────────────────────────────────
  let aptResult: ApartmentResult | null = null;
  if (input.isApartment) {
    const aptInput: ApartmentAddress = {
      propertyId: input.stopId,
      lat: input.lat,
      lng: input.lng,
      rawAddress: input.rawAddress,
      parcelCount: input.parcel.count,
      totalWeightKg: input.parcel.totalWeightKg,
      isOversize: input.parcel.isOversize,
    };
    aptResult = await analyseApartment(aptInput);
  }

  // ── Turn score ────────────────────────────────────────────
  const road = input.roadApproach;
  const turnScore = computeTurnScore(
    road?.roadWidthM ?? null,
    input.vehicleId,
    road?.hasTurningHead ?? false,
    road?.isDeadEnd ?? false,
    null, // community report — injected separately if available
  );
  const turnAlertLevel = getTurnAlert(turnScore);
  const canTurnAround = turnScore >= 0.75;

  // ── Vehicle restriction check ─────────────────────────────
  const { weightOk, heightOk } = checkVehicleRestrictions(input.vehicleId, road);

  // ── Pin accuracy ──────────────────────────────────────────
  const hasEntrancePin = aptResult?.suggestedEntryLat != null;
  const pinLat = aptResult?.suggestedEntryLat ?? input.lat;
  const pinLng = aptResult?.suggestedEntryLng ?? input.lng;
  const pinAccuracy: 'HIGH' | 'MEDIUM' | 'LOW' = hasEntrancePin ? 'HIGH' : 'MEDIUM';

  // ── Difficulty (combined apartment + road) ────────────────
  const aptDifficulty = aptResult?.difficultyScore ?? 1;
  const roadPenalty = turnAlertLevel === 'RED' ? 2 : turnAlertLevel === 'AMBER' ? 1 : 0;
  const difficultyScore = Math.min(5, Math.round((aptDifficulty + roadPenalty) * 10) / 10);

  // ── Alerts ────────────────────────────────────────────────
  const alerts = buildAlerts({
    turnAlertLevel,
    isDeadEnd: road?.isDeadEnd ?? false,
    hasTurningHead: road?.hasTurningHead ?? false,
    vehicleMaxWeightOk: weightOk,
    vehicleMaxHeightOk: heightOk,
    roadWidthM: road?.roadWidthM ?? null,
    liftStatus: aptResult?.liftStatus ?? null,
    hasIntercom: aptResult?.hasIntercom ?? false,
    isApartment: input.isApartment ?? false,
    floor: aptResult?.estimatedFloor ?? null,
    difficultyScore,
  });

  // ── Primary notification ──────────────────────────────────
  const primaryNotification = buildPrimaryNotification({
    rawAddress: input.rawAddress,
    isApartment: input.isApartment ?? false,
    floorLabel: aptResult?.estimatedFloorLabel ?? null,
    liftStatus: aptResult?.liftStatus ?? null,
    turnAlertLevel,
    floorPenaltyMinutes: aptResult?.floorPenaltyMinutes ?? 0,
  });

  const result: StopIntelligence = {
    stopId: input.stopId,
    pinLat, pinLng, pinAccuracy,
    isApartment: input.isApartment ?? false,
    floor: aptResult?.estimatedFloor ?? null,
    floorLabel: aptResult?.estimatedFloorLabel ?? null,
    totalBuildingFloors: aptResult?.totalBuildingFloors ?? null,
    liftStatus: aptResult?.liftStatus ?? null,
    hasIntercom: aptResult?.hasIntercom ?? false,
    allEntrances: aptResult?.allEntrances ?? [],
    turnAlertLevel,
    turnScore: Math.round(turnScore * 100) / 100,
    canTurnAround,
    roadWidthM: road?.roadWidthM ?? null,
    roadClass: road?.roadClass ?? null,
    isDeadEnd: road?.isDeadEnd ?? false,
    hasTurningHead: road?.hasTurningHead ?? false,
    vehicleMaxWeightOk: weightOk,
    vehicleMaxHeightOk: heightOk,
    parcel: input.parcel,
    floorPenaltyMinutes: aptResult?.floorPenaltyMinutes ?? 0,
    difficultyScore,
    primaryNotification,
    alerts,
    communityNotes: input.communityNotes ?? [],
    builtAt: Math.floor(Date.now() / 1000),
    cacheHit: false,
  };

  // ── Cache write ───────────────────────────────────────────
  if (input.cache) {
    await input.cache.set(CacheKey.stop(input.stopId), result, 'STOP');
  }

  return result;
}

/**
 * Batch build stop intelligence for an entire route.
 * Runs with capped concurrency (default 8) to avoid hammering Overpass.
 */
export async function buildRouteIntelligence(
  inputs: StopIntelligenceInput[],
  concurrency = 8,
): Promise<Map<string, StopIntelligence>> {
  const results = new Map<string, StopIntelligence>();
  const queue = [...inputs];

  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      try {
        const intel = await buildStopIntelligence(item);
        results.set(item.stopId, intel);
      } catch (err) {
        console.error(`[stop-intel] Failed for stop ${item.stopId}:`, err);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
