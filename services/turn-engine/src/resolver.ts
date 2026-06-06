/**
 * MJ Maps Systems — Turn Engine
 * Turn Score Resolver
 *
 * Orchestrates:
 *  1. Cache lookup (Redis, geohash key)
 *  2. OSM road data fetch (Overpass API)
 *  3. computeTurnScore() from vehicle-profiles package
 *  4. Alert level + driver reason string
 *  5. Cache write
 *
 * This is the single public entry point for the turn engine.
 * All callers (route engine, API handlers) use resolveTurnScore().
 */

import {
  VEHICLE_PROFILES,
  computeTurnScore,
  getTurnAlert,
  ALERT_DISTANCES,
  type TurnAlert,
} from '../../../packages/vehicle-profiles/index';

import { fetchNearestRoadSegment } from './osm-fetcher';
import { getFromCache, setInCache } from './cache';
import { encodeGeohash } from './geohash';
import type { LatLng, TurnEngineResult, OsmRoadSegment } from './types';

// ─── COMMUNITY SCORE STUB ────────────────────────────────────────────────────
// TODO: replace with real DB query once community_reports table is live
async function fetchCommunityScore(
  _location: LatLng,
  _vehicleProfileId: string,
): Promise<{ score: number; reportCount: number }> {
  return { score: 0, reportCount: 0 };
}

// ─── REASON STRING BUILDER ───────────────────────────────────────────────────

function buildReason(
  alert: TurnAlert,
  segment: OsmRoadSegment,
  vehicleLabel: string,
  widthM: number,
  minWidthNeeded: number,
): string {
  const confidence = segment.confidence === 'HIGH'
    ? 'surveyed width'
    : segment.confidence === 'MEDIUM'
      ? 'estimated width'
      : 'inferred width (no OSM tag — treat with caution)';

  const widthStr = `road ${widthM.toFixed(1)}m wide (${confidence})`;
  const needStr  = `${vehicleLabel} needs ${minWidthNeeded.toFixed(1)}m`;

  switch (alert) {
    case 'GREEN':
      return `Safe to approach — ${widthStr}, ${needStr}.`;
    case 'AMBER':
      if (segment.hasTurningHead) {
        return `Tight approach — ${widthStr}. Turning head present. ${needStr}. Proceed with care.`;
      }
      return `Tight road — ${widthStr}, ${needStr}. May need to reverse out.`;
    case 'RED':
      if (segment.isDeadEnd) {
        return `Do not enter — dead end, ${widthStr}. ${needStr}. Cannot turn around.`;
      }
      return `Road too narrow — ${widthStr}. ${needStr}. Rerouting to safe approach.`;
  }
}

// ─── MAIN RESOLVER ───────────────────────────────────────────────────────────

export async function resolveTurnScore(
  location: LatLng,
  vehicleProfileId: string,
): Promise<TurnEngineResult> {
  const profile = VEHICLE_PROFILES[vehicleProfileId];
  if (!profile) {
    throw new Error(`[turn-engine] Unknown vehicle profile: ${vehicleProfileId}`);
  }

  const geohash6 = encodeGeohash(location.lat, location.lng, 6);

  // ── 1. Cache lookup ──────────────────────────────────────────────────────
  const cached = await getFromCache(geohash6, vehicleProfileId);
  if (cached) return cached;

  // ── 2. OSM fetch ─────────────────────────────────────────────────────────
  const segment = await fetchNearestRoadSegment(location);

  // If OSM returns nothing, build a conservative fallback result
  if (!segment) {
    return buildFallbackResult(location, vehicleProfileId, profile.label, geohash6);
  }

  // ── 3. Community score ───────────────────────────────────────────────────
  const community = await fetchCommunityScore(location, vehicleProfileId);

  // ── 4. Compute turn score ────────────────────────────────────────────────
  const score = computeTurnScore({
    roadWidthM:          segment.widthM ?? 0,
    hasTurningHead:      segment.hasTurningHead,
    roadLengthToEndM:    segment.lengthToEndM,
    vehicleProfile:      profile,
    communityScore:      community.reportCount > 0 ? community.score : undefined,
    communityReportCount: community.reportCount,
  });

  const alert = getTurnAlert(score);
  const alertDistanceM = alert === 'GREEN'
    ? 0
    : alert === 'AMBER'
      ? ALERT_DISTANCES.turn.AMBER
      : ALERT_DISTANCES.turn.RED;

  const result: TurnEngineResult = {
    vehicleProfileId,
    location,
    segment,
    score,
    alert,
    alertDistanceM,
    reason: buildReason(alert, segment, profile.label, segment.widthM ?? 0, profile.minRoadWidthTurnM),
    fromCache: false,
    computedAt: new Date().toISOString(),
  };

  // ── 5. Cache write ───────────────────────────────────────────────────────
  await setInCache(geohash6, vehicleProfileId, result, false);

  return result;
}

// ─── FALLBACK RESULT ─────────────────────────────────────────────────────────

function buildFallbackResult(
  location: LatLng,
  vehicleProfileId: string,
  vehicleLabel: string,
  _geohash6: string,
): TurnEngineResult {
  // No OSM data — return AMBER with low confidence to warn driver without
  // hard blocking; driver can verify in person
  const fallbackSegment: OsmRoadSegment = {
    osmWayId: -1,
    tags: {},
    widthM: null,
    maxHeightM: null,
    maxWeightT: null,
    hasTurningHead: false,
    isDeadEnd: false,
    lengthToEndM: 999,
    confidence: 'LOW',
    lastEdited: null,
  };

  return {
    vehicleProfileId,
    location,
    segment: fallbackSegment,
    score: 0.50,
    alert: 'AMBER',
    alertDistanceM: ALERT_DISTANCES.turn.AMBER,
    reason: `No road data available for this location. Approach with care — ${vehicleLabel} may not be able to turn around.`,
    fromCache: false,
    computedAt: new Date().toISOString(),
  };
}
