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
  sequence: number;
}

export interface EnrichedStop extends StopPoint {
  osmContext: OsmRoadContext | null;
  turn: {
    score: number;
    alertLevel: TurnAlertLevel;
    alert: TurnAlert;
    alertDistanceM: number;
    message: string;
  } | null;
  clusterResult: ClusterResult | null;
  clusterId: number;
}

export interface EnrichedRoute {
  stops: EnrichedStop[];
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

// ─── TURN MESSAGE BUILDER ────────────────────────────────────────────────────

function buildTurnMessage(
  alertLevel: TurnAlertLevel,
  road: OsmRoadContext['road'],
  vehicleName: string,
): string {
  if (!road) return '';
  const name = road.name ? `on ${road.name}` : 'ahead';
  switch (alertLevel) {
    case 'green':
      return `\u2705 Road ${name} — safe to enter and turn for ${vehicleName}.`;
    case 'amber':
      return [
        `\u26a0\ufe0f Tight road ${name}.`,
        road.hasTurningHead
          ? `Turning head present — proceed carefully with ${vehicleName}.`
          : `Limited turning space — consider reversing out with ${vehicleName}.`,
      ].join(' ');
    case 'red':
      return [
        `\ud83d\udd34 Do NOT enter ${name} with ${vehicleName}.`,
        road.hasTurningHead
          ? 'Turning head exists but road too narrow for your vehicle.'
          : 'No turning space — you will be stuck. Reverse now.',
        road.isDeadEnd ? 'Dead end confirmed.' : '',
      ].filter(Boolean).join(' ');
  }
}

// ─── MAIN ENRICHMENT FUNCTION ────────────────────────────────────────────────

export async function enrichRoute(params: {
  stops: StopPoint[];
  vehicle: VehicleProfile;
  driverPreferences?: DriverPreferences;
}): Promise<EnrichedRoute> {
  const { stops, vehicle, driverPreferences = DEFAULT_DRIVER_PREFERENCES } = params;
  const start = Date.now();

  const osmContextMap = await getRoadContextBatch(
    stops.map(s => ({ id: s.id, lat: s.lat, lng: s.lng }))
  );

  const enrichedStops: EnrichedStop[] = stops.map(stop => {
    const osmContext = osmContextMap.get(stop.id) ?? null;
    const road = osmContext?.road ?? null;

    let turn: EnrichedStop['turn'] = null;

    if (road) {
      const result: TurnScoreResult = computeTurnScore(vehicle, road.widthM, {
        hasTurningHead: road.hasTurningHead,
        deadEndLengthM: road.lengthToEndM,
      });
      const alert: TurnAlert = getTurnAlert(result, vehicle.label);
      turn = {
        score: result.score,
        alertLevel: result.alertLevel,
        alert,
        alertDistanceM: TURN_ALERT_DISTANCES[result.alertLevel],
        message: buildTurnMessage(result.alertLevel, road, vehicle.label),
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

  const clusterStops: ClusterStop[] = enrichedStops.map(s => ({ ...s }));
  const clusters = detectClusters(clusterStops);

  clusters.forEach((cluster, clusterIdx) => {
    const anchorOsm = osmContextMap.get(cluster[0].id);
    const anchorRoad = anchorOsm?.road;

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

    cluster.forEach(clusterStop => {
      const enriched = enrichedStops.find(s => s.id === clusterStop.id);
      if (enriched) {
        enriched.clusterResult = clusterResult;
        enriched.clusterId = clusterIdx;
      }
    });
  });

  const redWarnings   = enrichedStops.filter(s => s.turn?.alertLevel === 'red').length;
  const amberWarnings = enrichedStops.filter(s => s.turn?.alertLevel === 'amber').length;
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
