/**
 * MJ Maps Systems — Road Enricher
 *
 * Takes a raw route (array of StopPoints) and enriches every stop
 * with live OSM road context, turn scores, and walk/drive cluster decisions.
 *
 * This is the orchestration layer that wires together:
 *   getRoadContextBatch()  → OSM Overpass
 *   computeTurnScore()     → vehicle-profiles
 *   scoreCluster()         → cluster-engine
 *
 * Called once per route before the driver starts, and re-called
 * incrementally when live rerouting is triggered.
 */

import { getRoadContextBatch, type OsmRoadContext } from './overpass-client';
import {
  computeTurnScore,
  getTurnAlert,
  type VehicleProfile,
  type TurnAlert,
} from '../../packages/vehicle-profiles/index';
import {
  detectClusters,
  scoreCluster,
  type ClusterStop,
  type ClusterResult,
  DEFAULT_DRIVER_PREFERENCES,
  type DriverPreferences,
} from '../cluster-engine/index';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface StopPoint {
  id: string;
  lat: number;
  lng: number;
  address: string;
  parcelCount: number;
  totalWeightKg: number;
  requiresSignature: boolean;
  isOversize: boolean;
  /** Sequence position in the optimised route */
  sequence: number;
}

export interface EnrichedStop extends StopPoint {
  osmContext: OsmRoadContext | null;
  turn: {
    score: number;
    alert: TurnAlert;
    /** Distance before stop at which to show the alert (metres) */
    alertDistanceM: number;
    /** Human-readable message for driver */
    message: string;
  } | null;
  /** If this stop is part of a walk cluster, the cluster result */
  clusterResult: ClusterResult | null;
  /** Index of cluster this stop belongs to (-1 = not clustered) */
  clusterId: number;
}

export interface EnrichedRoute {
  stops: EnrichedStop[];
  /** Summary stats for the dispatcher console */
  summary: {
    totalStops: number;
    redTurnWarnings: number;
    amberTurnWarnings: number;
    walkClusters: number;
    walkTimeSavedMin: number;
    levelCrossings: number;
    enrichmentTimeMs: number;
  };
}

// ─── ALERT DISTANCE TABLE ────────────────────────────────────────────────────

const ALERT_DISTANCES: Record<TurnAlert, number> = {
  GREEN: 0,
  AMBER: 300,
  RED:   500,
};

// ─── TURN MESSAGE BUILDER ────────────────────────────────────────────────────

function buildTurnMessage(
  alert: TurnAlert,
  road: OsmRoadContext['road'],
  vehicleName: string,
): string {
  if (!road) return '';
  const name = road.name ? `on ${road.name}` : 'ahead';
  switch (alert) {
    case 'GREEN':
      return `✅ Road ${name} — safe to enter and turn for ${vehicleName}.`;
    case 'AMBER':
      return [
        `⚠️ Tight road ${name}.`,
        road.hasTurningHead
          ? `Turning head present — proceed carefully with ${vehicleName}.`
          : `Limited turning space — consider reversing out with ${vehicleName}.`,
      ].join(' ');
    case 'RED':
      return [
        `🔴 Do NOT enter ${name} with ${vehicleName}.`,
        road.hasTurningHead
          ? 'Turning head exists but road too narrow for your vehicle.'
          : 'No turning space — you will be stuck. Reverse now.',
        road.isDeadEnd ? 'Dead end confirmed.' : '',
      ].filter(Boolean).join(' ');
  }
}

// ─── MAIN ENRICHMENT FUNCTION ────────────────────────────────────────────────

/**
 * Enrich a full route with OSM road data, turn scores, and cluster decisions.
 *
 * @example
 * const enriched = await enrichRoute({
 *   stops: optimisedStops,
 *   vehicle: VEHICLE_PROFILES.luton,
 * });
 * // enriched.stops[i].turn.alert === 'RED' → show warning 500m before
 * // enriched.stops[i].clusterResult?.decision === 'WALK' → park + walk
 */
export async function enrichRoute(params: {
  stops: StopPoint[];
  vehicle: VehicleProfile;
  driverPreferences?: DriverPreferences;
}): Promise<EnrichedRoute> {
  const { stops, vehicle, driverPreferences = DEFAULT_DRIVER_PREFERENCES } = params;
  const start = Date.now();

  // ── 1. Batch fetch all OSM road contexts ─────────────────────────────────
  const osmContextMap = await getRoadContextBatch(
    stops.map(s => ({ id: s.id, lat: s.lat, lng: s.lng }))
  );

  // ── 2. Compute turn score for every stop ─────────────────────────────────
  const enrichedStops: EnrichedStop[] = stops.map(stop => {
    const osmContext = osmContextMap.get(stop.id) ?? null;
    const road = osmContext?.road ?? null;

    let turn: EnrichedStop['turn'] = null;

    if (road) {
      const score = computeTurnScore({
        roadWidthM: road.widthM,
        hasTurningHead: road.hasTurningHead,
        roadLengthToEndM: road.lengthToEndM,
        vehicleProfile: vehicle,
      });
      const alert = getTurnAlert(score);
      turn = {
        score,
        alert,
        alertDistanceM: ALERT_DISTANCES[alert],
        message: buildTurnMessage(alert, road, vehicle.label),
      };
    }

    return {
      ...stop,
      osmContext,
      turn,
      clusterResult: null,
      clusterId: -1,
    };
  });

  // ── 3. Detect walk/drive clusters ────────────────────────────────────────
  const clusterStops: ClusterStop[] = enrichedStops.map(s => ({
    ...s,
    parcelCount: s.parcelCount,
    totalWeightKg: s.totalWeightKg,
    requiresSignature: s.requiresSignature,
    isOversize: s.isOversize,
  }));

  const clusters = detectClusters(clusterStops);

  clusters.forEach((cluster, clusterIdx) => {
    // Use the first stop's road context as the cluster road reference
    const anchorOsm = osmContextMap.get(cluster[0].id);
    const anchorRoad = anchorOsm?.road;

    // Next road: first stop NOT in this cluster after the last cluster stop
    const lastClusterStopIdx = enrichedStops.findIndex(
      s => s.id === cluster[cluster.length - 1].id
    );
    const nextStop = enrichedStops[lastClusterStopIdx + 1];
    const nextOsm = nextStop ? osmContextMap.get(nextStop.id) : null;
    const nextRoad = nextOsm?.road;

    const clusterResult = scoreCluster({
      stops: cluster,
      parkingLat: cluster[0].lat,
      parkingLng: cluster[0].lng,
      clusterRoadTurn: {
        roadWidthM: anchorRoad?.widthM ?? 5.0,
        hasTurningHead: anchorRoad?.hasTurningHead ?? false,
        roadLengthToEndM: anchorRoad?.lengthToEndM ?? 50,
      },
      nextRoadTurn: nextRoad ? {
        roadWidthM: nextRoad.widthM,
        hasTurningHead: nextRoad.hasTurningHead,
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

    // Write cluster result back to each enriched stop
    cluster.forEach(clusterStop => {
      const enriched = enrichedStops.find(s => s.id === clusterStop.id);
      if (enriched) {
        enriched.clusterResult = clusterResult;
        enriched.clusterId = clusterIdx;
      }
    });
  });

  // ── 4. Build summary ─────────────────────────────────────────────────────
  const redWarnings   = enrichedStops.filter(s => s.turn?.alert === 'RED').length;
  const amberWarnings = enrichedStops.filter(s => s.turn?.alert === 'AMBER').length;
  const walkClusters  = clusters.filter((_, i) => {
    const result = enrichedStops.find(s => s.clusterId === i)?.clusterResult;
    return result?.decision === 'WALK' || result?.decision === 'WALK_VIA_CUTTHROUGH';
  }).length;
  const walkTimeSaved = enrichedStops.reduce(
    (sum, s) => sum + (s.clusterResult?.timeSavedMin ?? 0), 0
  );
  const crossings = new Set(
    enrichedStops.flatMap(s => (s.osmContext?.levelCrossings ?? []).map(c => c.osmId))
  ).size;

  return {
    stops: enrichedStops,
    summary: {
      totalStops: stops.length,
      redTurnWarnings: redWarnings,
      amberTurnWarnings: amberWarnings,
      walkClusters,
      walkTimeSavedMin: Math.round(walkTimeSaved),
      levelCrossings: crossings,
      enrichmentTimeMs: Date.now() - start,
    },
  };
}
