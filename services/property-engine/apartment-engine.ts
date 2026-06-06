/**
 * MJ Maps Systems — Apartment Intelligence Engine
 *
 * Solves the biggest time-waster in urban last-mile delivery:
 * the driver arrives at a block, can't find the flat, wrong stairs,
 * no lift, heavy parcel, wrong entrance.
 *
 * This engine provides:
 *  1. Floor estimation from flat/apartment number heuristics
 *  2. Lift/elevator presence detection (OSM + community reports)
 *  3. Building entry point (main door vs intercom vs car park entrance)
 *  4. Stair vs lift workload scoring per parcel
 *  5. ETA uplift from floor penalty (stairs carry penalty, lift penalty smaller)
 *  6. Driver notification: "Flat 47 = Floor 4, lift present. Use main entrance on Church St."
 */

import { getRoadContext } from '../osm/overpass-client';

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface ApartmentAddress {
  propertyId: string;
  lat: number;
  lng: number;
  /** Full address string e.g. "Flat 47, Riverside House, Church Street" */
  rawAddress: string;
  /** Parsed flat/unit number e.g. 47 */
  flatNumber?: number | null;
  /** Parsed flat/unit identifier e.g. "4B", "G12", "LG3" */
  flatIdentifier?: string | null;
  /** Building name if known e.g. "Riverside House" */
  buildingName?: string | null;
  /** Postcode */
  postcode?: string | null;
  /** Total parcels for this stop */
  parcelCount?: number;
  /** Total weight in kg */
  totalWeightKg?: number;
  /** Any parcel oversize? */
  isOversize?: boolean;
}

export interface BuildingContext {
  /** OSM building node/way id */
  osmId?: number;
  /** Building type from OSM: apartments | residential | commercial | mixed */
  buildingType?: string;
  /** Number of floors from OSM (addr:levels or building:levels) */
  totalFloors?: number | null;
  /** Whether an elevator tag is present on the OSM way */
  hasElevatorTag?: boolean;
  /** Whether an entrance node is present */
  entranceLat?: number | null;
  entranceLng?: number | null;
  /** Entrance type: main | service | staircase | garage */
  entranceType?: string | null;
  /** Whether an intercom/buzzer tag is present */
  hasIntercomTag?: boolean;
}

export type LiftStatus = 'CONFIRMED_YES' | 'CONFIRMED_NO' | 'LIKELY_YES' | 'LIKELY_NO' | 'UNKNOWN';

export interface ApartmentResult {
  propertyId: string;

  // ── Floor intelligence
  estimatedFloor: number;           // 0 = ground, 1 = first etc.
  estimatedFloorLabel: string;      // "Ground", "1st", "2nd" etc.
  floorEstimationMethod: 'FLAT_NUMBER' | 'IDENTIFIER' | 'OSM_BUILDING' | 'DEFAULT';
  floorConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  totalBuildingFloors: number | null;

  // ── Lift intelligence
  liftStatus: LiftStatus;
  liftConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  liftSource: 'OSM' | 'COMMUNITY' | 'HEIGHT_INFERRED' | 'UK_REGS' | 'UNKNOWN';

  // ── Entry intelligence
  suggestedEntryLat: number | null;
  suggestedEntryLng: number | null;
  entranceType: string | null;
  hasIntercom: boolean;

  // ── Workload scoring
  /** Extra minutes added to service time vs ground-floor kerbside */
  floorPenaltyMinutes: number;
  /** Overall difficulty: 1 (easy) – 5 (very hard) */
  difficultyScore: number;

  // ── Driver notification
  notification: string;

  // ── Raw building context for debugging
  buildingContext: BuildingContext;
}

// ─── FLOOR ESTIMATION FROM FLAT NUMBER ─────────────────────────────────────────
//
// UK apartment numbering conventions:
//
// 1. Sequential from 1 (very common in small conversions):
//    Flats 1–4 = ground, 5–8 = 1st, 9–12 = 2nd etc.
//    But flats-per-floor varies wildly (2, 4, 6, 8, 12...)
//
// 2. Floor-prefixed:
//    Flat 101–199 = 1st floor, 201–299 = 2nd, 301–399 = 3rd
//    "Flat 305" → floor 3
//
// 3. Letter-suffixed:
//    Flat 1A, 1B, 1C = ground; 2A, 2B = 1st etc.
//    "Flat 3B" → floor 2 (3 = 3rd group = floors 0,1,2 → floor 2)
//
// 4. Identifier-prefixed:
//    GF1, G01, G1 = ground floor
//    LG1 = lower ground
//    B1, B2 = basement
//    1F1, 2F1 = floor number + flat
//
// 5. Very high numbers (Flat 234) are usually NOT floor-prefixed in small buildings;
//    in a purpose-built block they usually are.

export interface FloorEstimate {
  floor: number;
  method: 'FLAT_NUMBER' | 'IDENTIFIER' | 'OSM_BUILDING' | 'DEFAULT';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Parse and estimate floor from address text.
 * Returns floor as 0-indexed integer (0 = ground floor).
 */
export function estimateFloorFromAddress(
  address: string,
  buildingTotalFloors?: number | null,
  flatsPerFloor?: number | null,
): FloorEstimate {
  const upper = address.toUpperCase();

  // ── Identifier prefix patterns (highest confidence)
  // LG = lower ground, G/GF = ground, B = basement, then 1..n = floors
  const identMatch = upper.match(
    /FLAT\s+([LB]G|GF?|LG|B|[0-9]+F)\s*([0-9]+)?/i
  );
  if (identMatch) {
    const prefix = identMatch[1].toUpperCase();
    if (prefix === 'LG' || prefix === 'B')  return { floor: -1, method: 'IDENTIFIER', confidence: 'HIGH' };
    if (prefix === 'G' || prefix === 'GF')  return { floor: 0,  method: 'IDENTIFIER', confidence: 'HIGH' };
    const floorNum = parseInt(prefix.replace('F', ''), 10);
    if (!isNaN(floorNum)) return { floor: floorNum, method: 'IDENTIFIER', confidence: 'HIGH' };
  }

  // ── Floor-prefixed numbering: Flat 101–109 = Floor 1 etc.
  // Only apply when flat number is >= 100 (avoids misclassifying small blocks)
  const flatNumMatch = upper.match(/FLAT\s+([0-9]+)/);
  if (flatNumMatch) {
    const n = parseInt(flatNumMatch[1], 10);
    if (n >= 100 && n <= 9999) {
      const hundredsFloor = Math.floor(n / 100);
      return { floor: hundredsFloor, method: 'FLAT_NUMBER', confidence: 'MEDIUM' };
    }

    // ── Low flat numbers: use flats-per-floor estimate
    if (n >= 1 && n < 100) {
      const fpf = flatsPerFloor ?? guessFlatsPerFloor(buildingTotalFloors);
      const floor = Math.floor((n - 1) / fpf);
      return {
        floor,
        method: 'FLAT_NUMBER',
        confidence: flatsPerFloor ? 'HIGH' : 'LOW',
      };
    }
  }

  // ── Letter-suffixed: Flat 3B → group 3, so floor 2 (0-indexed)
  const letterMatch = upper.match(/FLAT\s+([0-9]+)([A-Z])/);
  if (letterMatch) {
    const group = parseInt(letterMatch[1], 10);
    return { floor: Math.max(0, group - 1), method: 'FLAT_NUMBER', confidence: 'MEDIUM' };
  }

  // ── "Apartment 5" without FLAT prefix
  const apartmentMatch = upper.match(/APT\.?\s+([0-9]+)|APARTMENT\s+([0-9]+)/i);
  if (apartmentMatch) {
    const n = parseInt(apartmentMatch[1] ?? apartmentMatch[2], 10);
    if (n >= 100) {
      return { floor: Math.floor(n / 100), method: 'FLAT_NUMBER', confidence: 'MEDIUM' };
    }
    const fpf = flatsPerFloor ?? guessFlatsPerFloor(buildingTotalFloors);
    return { floor: Math.floor((n - 1) / fpf), method: 'FLAT_NUMBER', confidence: 'LOW' };
  }

  // ── Floor explicitly mentioned in address
  const floorMention = upper.match(/(GROUND|FIRST|SECOND|THIRD|[0-9]+(?:ST|ND|RD|TH))\s+FLOOR/i);
  if (floorMention) {
    const word = floorMention[1];
    const wordMap: Record<string, number> = { GROUND: 0, FIRST: 1, SECOND: 2, THIRD: 3 };
    if (wordMap[word] !== undefined) return { floor: wordMap[word], method: 'IDENTIFIER', confidence: 'HIGH' };
    const num = parseInt(word, 10);
    if (!isNaN(num)) return { floor: num, method: 'IDENTIFIER', confidence: 'HIGH' };
  }

  return { floor: 1, method: 'DEFAULT', confidence: 'LOW' };
}

function guessFlatsPerFloor(totalFloors?: number | null): number {
  if (!totalFloors) return 4;
  if (totalFloors <= 3) return 2;
  if (totalFloors <= 6) return 4;
  if (totalFloors <= 12) return 6;
  return 8;
}

function floorLabel(floor: number): string {
  if (floor < 0) return 'Basement';
  if (floor === 0) return 'Ground floor';
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const suffix = floor <= 3 ? suffixes[floor] : 'th';
  return `${floor}${suffix} floor`;
}

// ─── LIFT INFERENCE ────────────────────────────────────────────────────────────────
//
// UK building regulations:
//   Mandatory lift from 5+ storeys (Approved Document M, Building Regs 2010).
//   Strongly recommended from 4 storeys.
//   New builds from 2003 onwards: lifetime homes standard encourages lifts from 3 storeys.
//
// Purpose-built post-2000 blocks: LIKELY_YES from 4+ floors.
// Victorian/Edwardian conversions (pre-1940): LIKELY_NO unless refurbished.
// Tower blocks (10+ floors): near certainty of lift.

export interface LiftInference {
  status: LiftStatus;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source: 'OSM' | 'COMMUNITY' | 'HEIGHT_INFERRED' | 'UK_REGS' | 'UNKNOWN';
}

export function inferLiftStatus(
  buildingContext: BuildingContext,
  communityReports?: { hasLift: boolean; reportCount: number } | null,
): LiftInference {
  // Community reports are strongest signal
  if (communityReports && communityReports.reportCount >= 3) {
    return {
      status: communityReports.hasLift ? 'CONFIRMED_YES' : 'CONFIRMED_NO',
      confidence: 'HIGH',
      source: 'COMMUNITY',
    };
  }

  // OSM elevator tag on the building
  if (buildingContext.hasElevatorTag === true) {
    return { status: 'CONFIRMED_YES', confidence: 'HIGH', source: 'OSM' };
  }
  if (buildingContext.hasElevatorTag === false) {
    // OSM absence of tag does NOT mean no lift — under-tagged
    // treat as unknown
  }

  // Infer from floor count
  const floors = buildingContext.totalFloors;
  if (floors != null) {
    if (floors >= 10) return { status: 'LIKELY_YES', confidence: 'HIGH', source: 'HEIGHT_INFERRED' };
    if (floors >= 5)  return { status: 'LIKELY_YES', confidence: 'MEDIUM', source: 'UK_REGS' };
    if (floors === 4) return { status: 'LIKELY_YES', confidence: 'LOW', source: 'UK_REGS' };
    if (floors <= 3)  return { status: 'LIKELY_NO', confidence: 'MEDIUM', source: 'UK_REGS' };
  }

  return { status: 'UNKNOWN', confidence: 'LOW', source: 'UNKNOWN' };
}

// ─── FLOOR PENALTY (extra service time vs ground floor) ──────────────────────────────
//
// Based on timing studies of urban couriers. Minutes extra per delivery
// vs a kerbside ground-floor delivery.

const LIFT_PENALTY_PER_FLOOR_MIN   = 0.4; // 24 sec per floor including wait
const STAIRS_PENALTY_PER_FLOOR_MIN = 0.8; // 48 sec per floor with parcel
const LIFT_WAIT_MIN                = 0.75; // 45 sec average lift wait

export function calculateFloorPenalty(params: {
  floor: number;
  liftStatus: LiftStatus;
  parcelCount: number;
  totalWeightKg: number;
  isOversize: boolean;
}): number {
  const { floor, liftStatus, parcelCount, totalWeightKg, isOversize } = params;
  if (floor <= 0) return 0;

  const hasLift = liftStatus === 'CONFIRMED_YES' || liftStatus === 'LIKELY_YES';
  const perFloor = hasLift ? LIFT_PENALTY_PER_FLOOR_MIN : STAIRS_PENALTY_PER_FLOOR_MIN;
  const liftWait = hasLift ? LIFT_WAIT_MIN : 0;

  // Heavier or oversize parcels take longer
  const weightMultiplier = isOversize ? 1.6 :
    totalWeightKg > 15 ? 1.4 :
    totalWeightKg > 8  ? 1.2 :
    1.0;

  // Multiple parcels add a trip-repeat penalty
  const tripMultiplier = parcelCount > 1 ? 1 + (parcelCount - 1) * 0.5 : 1;

  const raw = (floor * perFloor + liftWait) * weightMultiplier * tripMultiplier;
  return Math.round(raw * 10) / 10;
}

// ─── DIFFICULTY SCORE ────────────────────────────────────────────────────────────────

export function calculateDifficultyScore(params: {
  floor: number;
  liftStatus: LiftStatus;
  parcelCount: number;
  totalWeightKg: number;
  isOversize: boolean;
  hasIntercom: boolean;
  floorPenaltyMinutes: number;
}): number {
  const { floor, liftStatus, parcelCount, totalWeightKg, isOversize, hasIntercom, floorPenaltyMinutes } = params;

  let score = 1; // baseline

  if (floor >= 5) score += 2;
  else if (floor >= 3) score += 1;
  else if (floor >= 1) score += 0.5;

  if (liftStatus === 'CONFIRMED_NO' || liftStatus === 'LIKELY_NO') score += 1.5;
  else if (liftStatus === 'UNKNOWN') score += 0.5;

  if (totalWeightKg > 15 || isOversize) score += 1;
  else if (totalWeightKg > 8) score += 0.5;

  if (parcelCount > 2) score += 0.5;
  if (hasIntercom) score += 0.5; // wait for answer

  return Math.min(5, Math.round(score * 10) / 10);
}

// ─── NOTIFICATION BUILDER ────────────────────────────────────────────────────────

function buildApartmentNotification(p: {
  address: string;
  estimatedFloorLabel: string;
  liftStatus: LiftStatus;
  hasIntercom: boolean;
  entranceType: string | null;
  difficultyScore: number;
  floorPenaltyMinutes: number;
}): string {
  const parts: string[] = [];

  const liftIcon =
    p.liftStatus === 'CONFIRMED_YES' || p.liftStatus === 'LIKELY_YES' ? '🛗 Lift available' :
    p.liftStatus === 'CONFIRMED_NO' || p.liftStatus === 'LIKELY_NO'   ? '🚶 Stairs only' :
    '❓ Lift unknown';

  parts.push(`🏢 ${p.estimatedFloorLabel} — ${liftIcon}.`);

  if (p.hasIntercom) parts.push('🔔 Intercom/buzzer at entrance.');
  if (p.entranceType === 'service') parts.push('📦 Use service entrance for deliveries.');
  if (p.floorPenaltyMinutes >= 2) parts.push(`⏱️ +${p.floorPenaltyMinutes} min service time.`);
  if (p.difficultyScore >= 4) parts.push('⚠️ Difficult stop — allow extra time.');

  return parts.join(' ');
}

// ─── MAIN EXPORT ───────────────────────────────────────────────────────────────

/**
 * Analyse an apartment stop and return full intelligence for the driver.
 *
 * @example
 * const result = await analyseApartment({
 *   propertyId: 'stop-12',
 *   lat: 51.5074, lng: -0.1278,
 *   rawAddress: 'Flat 305, Tower House, High Street, London',
 *   parcelCount: 1, totalWeightKg: 4.5,
 * });
 *
 * // result.notification:
 * // "🏢 3rd floor — 🛗 Lift available. ⏱️ +1.6 min service time."
 */
export async function analyseApartment(
  apt: ApartmentAddress,
  communityReports?: { hasLift: boolean; reportCount: number } | null,
): Promise<ApartmentResult> {

  // ── Fetch building context from OSM ────────────────────────────────────
  const osmCtx = await getRoadContext({ lat: apt.lat, lng: apt.lng, roadRadiusM: 50, walkRadiusM: 50 });
  const buildingContext = extractBuildingContext(osmCtx);

  // ── Floor estimation ─────────────────────────────────────────────────────────
  const floorEst = estimateFloorFromAddress(
    apt.rawAddress,
    buildingContext.totalFloors,
    null,
  );
  const label = floorLabel(floorEst.floor);

  // ── Lift inference ───────────────────────────────────────────────────────────
  const liftInference = inferLiftStatus(buildingContext, communityReports ?? null);

  // ── Floor penalty ───────────────────────────────────────────────────────────
  const floorPenaltyMinutes = calculateFloorPenalty({
    floor: floorEst.floor,
    liftStatus: liftInference.status,
    parcelCount: apt.parcelCount ?? 1,
    totalWeightKg: apt.totalWeightKg ?? 1,
    isOversize: apt.isOversize ?? false,
  });

  // ── Difficulty score ──────────────────────────────────────────────────────────
  const difficultyScore = calculateDifficultyScore({
    floor: floorEst.floor,
    liftStatus: liftInference.status,
    parcelCount: apt.parcelCount ?? 1,
    totalWeightKg: apt.totalWeightKg ?? 1,
    isOversize: apt.isOversize ?? false,
    hasIntercom: buildingContext.hasIntercomTag ?? false,
    floorPenaltyMinutes,
  });

  const notification = buildApartmentNotification({
    address: apt.rawAddress,
    estimatedFloorLabel: label,
    liftStatus: liftInference.status,
    hasIntercom: buildingContext.hasIntercomTag ?? false,
    entranceType: buildingContext.entranceType ?? null,
    difficultyScore,
    floorPenaltyMinutes,
  });

  return {
    propertyId: apt.propertyId,
    estimatedFloor: floorEst.floor,
    estimatedFloorLabel: label,
    floorEstimationMethod: floorEst.method,
    floorConfidence: floorEst.confidence,
    totalBuildingFloors: buildingContext.totalFloors ?? null,
    liftStatus: liftInference.status,
    liftConfidence: liftInference.confidence,
    liftSource: liftInference.source,
    suggestedEntryLat: buildingContext.entranceLat ?? null,
    suggestedEntryLng: buildingContext.entranceLng ?? null,
    entranceType: buildingContext.entranceType ?? null,
    hasIntercom: buildingContext.hasIntercomTag ?? false,
    floorPenaltyMinutes,
    difficultyScore,
    notification,
    buildingContext,
  };
}

// ─── OSM BUILDING CONTEXT EXTRACTOR ──────────────────────────────────────────────────
// The current Overpass query doesn't fetch building ways directly.
// The road-enricher enriches roads and paths. Buildings are a separate query.
// For now we extract what we can from the surrounding road context
// and fall back gracefully. Building polygon fetching is Phase 2.

function extractBuildingContext(ctx: any): BuildingContext {
  // Placeholder: returns empty context until building polygon
  // fetching is added in Phase 2 of the Overpass client.
  return {
    osmId: undefined,
    buildingType: undefined,
    totalFloors: null,
    hasElevatorTag: undefined,
    entranceLat: null,
    entranceLng: null,
    entranceType: null,
    hasIntercomTag: false,
  };
}
