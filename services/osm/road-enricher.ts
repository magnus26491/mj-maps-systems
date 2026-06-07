/**
 * MJ Maps Systems — Road Enricher
 *
 * Takes a raw route (array of StopPoints) and enriches every stop with:
 *   1. Exact delivery pin  ← NEW: batchResolvePins() called first
 *   2. Live OSM road context  ← now uses pin coords, not postcode centroid
 *   3. Turn score + approach-side decision
 *   4. Walk/drive cluster decision
 *
 * Orchestration order:
 *   batchResolvePins()     → updates stop.pin to most accurate available coord
 *   getRoadContextBatch()  → queries OSM at the pin coord (not postcode)
 *   computeTurnScore()     → vehicle-profiles scoring
 *   resolveApproach()      → turn-around method + pre-alert waypoint
 *   scoreCluster()         → walk vs drive decision
 *
 * Called once per route before the driver starts, and re-called
 * incrementally when live rerouting is triggered.
 */

import { getRoadContextBatch, type OsmRoadContext } from './overpass-client';
import {
  computeTurnScore,
  getTurnAlert,
  TURN_ALERT_DISTANCES,
  type VehicleProfile,
  type TurnAlertLevel,
  type TurnAlert,
  type TurnScoreResult,
} from '../../packages/vehicle-profiles/index';
import {
  detectClusters,
  scoreCluster,
  type ClusterStop,
  type ClusterResult,
  DEFAULT_DRIVER_PREFERENCES,
  type DriverPreferences,
} from '../cluster-engine/index';
import {
  batchResolvePins,
  type PinResolveInput,
  type ResolvedPin,
} from '../pin-resolver/index';
import { buildFetchCoords } from '../pin-resolver/coords-fetcher';
import { resolveApproach, type ApproachDecision } from '../turn-engine/src/approach-side';
import { bearing as computeBearing } from '../cluster-engine/side-of-road-grouper';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface StopPoint {
  id: string;
  lat: number;
  lng: number;
  address: string;
  postcode?: string;          // needed by pin-resolver
  what3words?: string;        // optional W3W address
  parcelCount: number;
  totalWeightKg: number;
  requiresSignature: boolean;
  isOversize: boolean;
  sequence: number;
  // Community-verified pin (populated from DB before enrichRoute is called)
  driverVerifiedPin?: { lat: number; lng: number; verifiedAt: string };
  communityPin?: { lat: number; lng: number; verifiedAt: string; verifyCount: number };
  pin?: { lat: number; lng: number };  // set by batchResolvePins, used downstream
  access_notes?: string;
}

export interface PinMeta {
  source: ResolvedPin['source'];
  confidence: number;
  what3wordsAddress?: string;
  accessNotes?: string;       // entrance notes, parking, W3W line
  lastVerifiedAt?: string;
}

export interface EnrichedStop extends StopPoint {
  pinMeta: PinMeta | null;    // confidence + source of the resolved pin
  osmContext: OsmRoadContext | null;
  turn: {
    score: number;
    alertLevel: TurnAlertLevel;
    alert: TurnAlert;
    alertDistanceM: number;
    message: string;
    approach: ApproachDecision;
  } | null;
  clusterResult: ClusterResult | null;
  clusterId: number;
}

export interface EnrichedRoute {
  stops: EnrichedStop[];
  summary: {
    totalStops: number;
    pinsResolved: number;          // how many stops got a sub-postcode pin
    pinsFromCommunity: number;     // driver-verified pins used
    pinsFromW3W: number;
    pinsFromOsm: number;
    pinsAtPostcodeFallback: number; // warn: least accurate
    redTurnWarnings: number;
    amberTurnWarnings: number;
    walkClusters: number;
    walkTimeSavedMin: number;
    levelCrossings: number;
    enrichmentTimeMs: number;
  };
}

// ─── TURN MESSAGE BUILDER ────────────────────────────────────────────────────

function buildTurnMessage(
  alertLevel: TurnAlertLevel,
  road: OsmRoadContext['road'],
  vehicleName: string,
  approach: ApproachDecision,
): string {
  const name = road?.name ? `on ${road.name}` : 'ahead';

  if (approach.turnAroundMethod === 'NOT_REQUIRED') {
    return `✅ Road ${name} — safe to enter and turn for ${vehicleName}.`;
  }

  if (alertLevel === 'amber') {
    const headExtra = road?.hasTurningHead
      ? `Turning head present — use it.`
      : `Plan a ${approach.turnAroundMethod === 'THREE_POINT' ? '3-point turn' : 'reverse-out'}.`;
    return `⚠️ Tight road ${name}. ${headExtra} ${approach.message}`;
  }

  // RED
  return [
    `🔴 Do NOT enter ${name} with ${vehicleName}.`,
    approach.message,
    road?.isDeadEnd ? 'Dead end confirmed.' : '',
  ].filter(Boolean).join(' ');
}

// ─── MAIN ENRICHMENT FUNCTION ────────────────────────────────────────────────

export async function enrichRoute(params: {
  stops: StopPoint[];
  vehicle: VehicleProfile;
  driverPreferences?: DriverPreferences;
  w3wApiKey?: string;           // optional — skips W3W resolution if absent
}): Promise<EnrichedRoute> {
  const { stops, vehicle, driverPreferences = DEFAULT_DRIVER_PREFERENCES, w3wApiKey } = params;
  const start = Date.now();

  // ── STEP 1: Resolve exact delivery pins ────────────────────────────────
  // Build the pin-resolver input index
  const pinInputs: Array<PinResolveInput & StopPoint> = stops.map(s => ({
    ...s,
    stopId: s.id,
    postcode: s.postcode ?? extractPostcode(s.address),
  }));

  const stopIndex = new Map(
    pinInputs.map(s => [s.id, s as PinResolveInput])
  );

  const fetchCoords = buildFetchCoords(stopIndex, w3wApiKey);

  // batchResolvePins returns the same array with .pin and .access_notes updated
  const pinnedStops = await batchResolvePins(pinInputs, fetchCoords);

  // Build a map of resolved pin metadata for the enriched output
  const pinMetaMap = new Map<string, PinMeta>();
  pinnedStops.forEach((s, i) => {
    if (!s.pin) return;
    const orig = pinInputs[i];
    // Determine source from coords-fetcher precedence
    // We can't access ResolvedPin directly here (batchResolvePins mutates the stop)
    // so we infer from access_notes and community fields
    let source: ResolvedPin['source'] = 'geocoder';
    let confidence = 0.62;
    if (orig.communityPin && orig.communityPin.verifyCount >= 2) {
      source = 'community_verified'; confidence = 0.95;
    } else if (orig.driverVerifiedPin) {
      source = 'community_verified'; confidence = 0.90;
    } else if (orig.what3words) {
      source = 'what3words'; confidence = 0.95;
    } else if (s.access_notes?.includes('Approximate location')) {
      source = 'postcode_centroid'; confidence = 0.25;
    }

    pinMetaMap.set(s.id, {
      source,
      confidence,
      what3wordsAddress: orig.what3words,
      accessNotes: s.access_notes,
      lastVerifiedAt: orig.communityPin?.verifiedAt ?? orig.driverVerifiedPin?.verifiedAt,
    });
  });

  // ── STEP 2: Fetch OSM road context using the resolved pin coordinates ─────
  // Use pin coords for OSM lookup so we get road data for the exact delivery
  // point, not the postcode centroid which might be 200m away on a different road.
  const osmContextMap = await getRoadContextBatch(
    pinnedStops.map(s => ({
      id: s.id,
      lat: s.pin?.lat ?? s.lat,
      lng: s.pin?.lng ?? s.lng,
    }))
  );

  // ── STEP 3: Build enriched stops with turn score + approach decision ────
  const enrichedStops: EnrichedStop[] = pinnedStops.map((stop, i) => {
    const osmContext = osmContextMap.get(stop.id) ?? null;
    const road = osmContext?.road ?? null;

    // Compute incoming bearing from previous stop (used by approach resolver)
    const prevStop = i > 0 ? pinnedStops[i - 1] : null;
    const incomingBearing = prevStop
      ? computeBearing(
          { lat: prevStop.pin?.lat ?? prevStop.lat, lng: prevStop.pin?.lng ?? prevStop.lng },
          { lat: stop.pin?.lat ?? stop.lat,          lng: stop.pin?.lng ?? stop.lng },
        )
      : 0;

    let turn: EnrichedStop['turn'] = null;

    if (road) {
      const scoreResult: TurnScoreResult = computeTurnScore(vehicle, road.widthM, {
        hasTurningHead: road.hasTurningHead,
        deadEndLengthM: road.lengthToEndM,
      });
      const alert: TurnAlert = getTurnAlert(scoreResult, vehicle.label);

      const approach: ApproachDecision = resolveApproach(
        scoreResult,
        vehicle,
        road.widthM,
        {
          hasTurningHead: road.hasTurningHead,
          isDeadEnd:      road.isDeadEnd,
          deadEndDepthM:  road.lengthToEndM,
          stopLat:        stop.pin?.lat ?? stop.lat,
          stopLng:        stop.pin?.lng ?? stop.lng,
          incomingBearing,
        },
      );

      turn = {
        score:         scoreResult.score,
        alertLevel:    scoreResult.alertLevel,
        alert,
        alertDistanceM: approach.alertDistanceM || TURN_ALERT_DISTANCES[scoreResult.alertLevel],
        message:       buildTurnMessage(scoreResult.alertLevel, road, vehicle.label, approach),
        approach,
      };
    }

    return {
      ...stop,
      pinMeta: pinMetaMap.get(stop.id) ?? null,
      osmContext,
      turn,
      clusterResult: null,
      clusterId: -1,
    };
  });

  // ── STEP 4: Walk / drive cluster decisions ─────────────────────────────
  const clusterStops: ClusterStop[] = enrichedStops.map(s => ({ ...s }));
  const clusters = detectClusters(clusterStops);

  clusters.forEach((cluster, clusterIdx) => {
    const anchorOsm = osmContextMap.get(cluster[0].id);
    const anchorRoad = anchorOsm?.road;

    const lastIdx = enrichedStops.findIndex(
      s => s.id === cluster[cluster.length - 1].id
    );
    const nextStop  = enrichedStops[lastIdx + 1];
    const nextOsm   = nextStop ? osmContextMap.get(nextStop.id) : null;
    const nextRoad  = nextOsm?.road;

    const clusterResult = scoreCluster({
      stops: cluster,
      parkingLat: cluster[0].pin?.lat ?? cluster[0].lat,
      parkingLng: cluster[0].pin?.lng ?? cluster[0].lng,
      clusterRoadTurn: {
        roadWidthM:       anchorRoad?.widthM       ?? 5.0,
        hasTurningHead:   anchorRoad?.hasTurningHead ?? false,
        roadLengthToEndM: anchorRoad?.lengthToEndM ?? 50,
      },
      nextRoadTurn: nextRoad ? {
        roadWidthM:       nextRoad.widthM,
        hasTurningHead:   nextRoad.hasTurningHead,
        roadLengthToEndM: nextRoad.lengthToEndM,
      } : undefined,
      pedestrianPaths: (anchorOsm?.pedestrianPaths ?? []).map(p => ({
        id: String(p.osmId),
        type: p.highway as any,
        distanceM: p.lengthM,
        isLit: p.isLit,
        hasSteps: p.hasSteps,
        accessConfirmed: p.access === 'yes' || p.access === 'permissive',
        communityVerifications: 0,
      })),
      vehicle,
      driverPreferences,
    });

    cluster.forEach(cs => {
      const enriched = enrichedStops.find(s => s.id === cs.id);
      if (enriched) {
        enriched.clusterResult = clusterResult;
        enriched.clusterId = clusterIdx;
      }
    });
  });

  // ── STEP 5: Build summary ────────────────────────────────────────────────
  const pinMetas = [...pinMetaMap.values()];

  const redWarnings    = enrichedStops.filter(s => s.turn?.alertLevel === 'red').length;
  const amberWarnings  = enrichedStops.filter(s => s.turn?.alertLevel === 'amber').length;
  const walkClusters   = clusters.filter((_, i) => {
    const result = enrichedStops.find(s => s.clusterId === i)?.clusterResult;
    return result?.decision === 'WALK' || result?.decision === 'WALK_VIA_CUTTHROUGH';
  }).length;
  const walkTimeSaved  = enrichedStops.reduce(
    (sum, s) => sum + (s.clusterResult?.timeSavedMin ?? 0), 0
  );
  const crossings = new Set(
    enrichedStops.flatMap(s => (s.osmContext?.levelCrossings ?? []).map(c => c.osmId))
  ).size;

  return {
    stops: enrichedStops,
    summary: {
      totalStops:             stops.length,
      pinsResolved:           pinMetas.filter(p => p.source !== 'postcode_centroid').length,
      pinsFromCommunity:      pinMetas.filter(p => p.source === 'community_verified').length,
      pinsFromW3W:            pinMetas.filter(p => p.source === 'what3words').length,
      pinsFromOsm:            pinMetas.filter(p => p.source === 'osm_building').length,
      pinsAtPostcodeFallback: pinMetas.filter(p => p.source === 'postcode_centroid').length,
      redTurnWarnings:        redWarnings,
      amberTurnWarnings:      amberWarnings,
      walkClusters,
      walkTimeSavedMin:       Math.round(walkTimeSaved),
      levelCrossings:         crossings,
      enrichmentTimeMs:       Date.now() - start,
    },
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Extract a UK postcode from a freeform address string. */
function extractPostcode(address: string): string {
  const match = address.match(
    /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i
  );
  return match ? match[1].toUpperCase() : '';
}
