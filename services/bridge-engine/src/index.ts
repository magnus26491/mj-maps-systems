/**
 * Bridge Engine — vehicle height/weight clearance checks.
 *
 * Checks whether a vehicle can safely pass under a bridge or through
 * a restricted road section, using OSM bridge height/weight data.
 *
 * Called by:
 *  · route-engine at planning time (pre-filters routes with known bridge conflicts)
 *  · turn-engine at approach time (300m warning if bridge on approach path)
 *
 * OSM tags used:
 *  · maxheight (metres) — bridge clearance
 *  · maxweight (tonnes) — weight restriction
 *  · maxwidth  (metres) — width restriction (narrow bridges)
 *
 * Vehicle profiles provide:
 *  · heightM  — vehicle height including load
 *  · weightT  — gross vehicle weight
 *  · widthM   — vehicle width including mirrors
 */
import type { VehicleProfile } from '../../packages/vehicle-profiles/index';

export interface BridgeNode {
  id:          string;  // OSM node/way ID
  lat:         number;
  lng:         number;
  maxHeightM:  number | null;  // null = unrestricted
  maxWeightT:  number | null;
  maxWidthM:   number | null;
  source:      'osm' | 'community';
}

export type BridgeClearance = {
  canPass:   boolean;
  limitingFactor: 'height' | 'weight' | 'width' | null;
  marginM?:  number;   // positive = clearance, negative = clash
  marginT?:  number;
  bridge:    BridgeNode;
};

/**
 * Check if a vehicle can pass a specific bridge node.
 * Returns clearance details so the caller can produce a helpful alert.
 */
export function checkBridgeClearance(
  bridge: BridgeNode,
  vehicle: VehicleProfile,
): BridgeClearance {
  let canPass         = true;
  let limitingFactor: BridgeClearance['limitingFactor'] = null;
  let marginM: number | undefined;
  let marginT: number | undefined;

  // Height check — most common bridge strike cause
  if (bridge.maxHeightM !== null) {
    marginM = bridge.maxHeightM - vehicle.heightM;
    if (marginM < 0) {
      canPass        = false;
      limitingFactor = 'height';
    }
  }

  // Weight check
  if (canPass && bridge.maxWeightT !== null) {
    marginT = bridge.maxWeightT - vehicle.weightT;
    if (marginT < 0) {
      canPass        = false;
      limitingFactor = 'weight';
    }
  }

  // Width check
  if (canPass && bridge.maxWidthM !== null) {
    const wMargin = bridge.maxWidthM - vehicle.widthM;
    if (wMargin < 0) {
      canPass        = false;
      limitingFactor = limitingFactor ?? 'width';
      marginM        = wMargin; // reuse marginM for width margin
    }
  }

  return { canPass, limitingFactor, marginM, marginT, bridge };
}

/**
 * Filter a list of bridge nodes to only those that conflict with the vehicle.
 * Used by route-engine to pre-screen a planned path before sending to driver.
 */
export function findBridgeConflicts(
  bridges: BridgeNode[],
  vehicle: VehicleProfile,
): BridgeClearance[] {
  return bridges
    .map(b => checkBridgeClearance(b, vehicle))
    .filter(r => !r.canPass);
}

/**
 * Human-readable alert message for a bridge conflict.
 * Used by the HUD and turn-warning overlay.
 */
export function bridgeAlertMessage(clearance: BridgeClearance): string {
  const { limitingFactor, marginM, marginT, bridge } = clearance;
  switch (limitingFactor) {
    case 'height':
      return `Bridge ahead: ${bridge.maxHeightM}m clearance — your vehicle is ${Math.abs(marginM ?? 0).toFixed(2)}m too tall.`;
    case 'weight':
      return `Weight limit ahead: ${bridge.maxWeightT}t — your vehicle exceeds by ${Math.abs(marginT ?? 0).toFixed(1)}t.`;
    case 'width':
      return `Narrow bridge: ${bridge.maxWidthM}m wide — your vehicle needs ${Math.abs(marginM ?? 0).toFixed(2)}m more clearance.`;
    default:
      return 'Restriction ahead — check before proceeding.';
  }
}
