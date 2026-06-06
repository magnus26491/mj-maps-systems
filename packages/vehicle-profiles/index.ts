/**
 * Vehicle Profiles
 * Full geometry constants for UK + worldwide vehicle classes.
 * Used by turn-engine, route-engine, and stop-precision service.
 */

export type VehicleId =
  | 'bicycle'
  | 'motorbike'
  | 'small_car'
  | 'large_car'
  | 'swb_van'
  | 'lwb_van'
  | 'luton_van'
  | 'tipper_swb'
  | 'tipper_lwb'
  | '7_5t_rigid'
  | '18t_rigid'
  | '26t_rigid'
  | 'artic_13_6m'
  | 'artic_15_5m'
  | 'car_trailer'
  | 'horse_trailer'
  | 'caravan_7m'
  | 'minibus'
  | 'coach';

export interface VehicleProfile {
  id: VehicleId;
  label: string;
  lengthM: number;
  widthM: number;
  heightM: number;
  /** Gross vehicle weight in tonnes */
  gvwT: number;
  /** Minimum road width required to drive (not turn) */
  minDriveWidthM: number;
  /** Outer turning radius, kerb-to-kerb */
  outerTurningRadiusM: number;
  /** Inner turning radius */
  innerTurningRadiusM: number;
  /** Minimum cul-de-sac / turning head diameter for 3-point turn */
  minThreePointTurnDiameterM: number;
  /** True if legally requires HGV routing (>3.5t GVW in UK) */
  hgvRouting: boolean;
  /** True if requires special access permissions for some road types */
  requiresAccessPermit: boolean;
}

export const VEHICLE_PROFILES: Record<VehicleId, VehicleProfile> = {
  bicycle: {
    id: 'bicycle', label: 'Bicycle',
    lengthM: 1.8, widthM: 0.6, heightM: 1.1, gvwT: 0.1,
    minDriveWidthM: 0.8, outerTurningRadiusM: 2.5, innerTurningRadiusM: 1.0,
    minThreePointTurnDiameterM: 3.0, hgvRouting: false, requiresAccessPermit: false,
  },
  motorbike: {
    id: 'motorbike', label: 'Motorbike',
    lengthM: 2.2, widthM: 0.8, heightM: 1.2, gvwT: 0.5,
    minDriveWidthM: 1.0, outerTurningRadiusM: 3.5, innerTurningRadiusM: 1.5,
    minThreePointTurnDiameterM: 4.0, hgvRouting: false, requiresAccessPermit: false,
  },
  small_car: {
    id: 'small_car', label: 'Small Car',
    lengthM: 3.9, widthM: 1.7, heightM: 1.5, gvwT: 1.8,
    minDriveWidthM: 2.5, outerTurningRadiusM: 5.0, innerTurningRadiusM: 2.5,
    minThreePointTurnDiameterM: 7.5, hgvRouting: false, requiresAccessPermit: false,
  },
  large_car: {
    id: 'large_car', label: 'Large Car / SUV',
    lengthM: 4.9, widthM: 1.95, heightM: 1.65, gvwT: 2.5,
    minDriveWidthM: 2.8, outerTurningRadiusM: 6.0, innerTurningRadiusM: 2.8,
    minThreePointTurnDiameterM: 9.0, hgvRouting: false, requiresAccessPermit: false,
  },
  swb_van: {
    id: 'swb_van', label: 'SWB Van (e.g. Transit SWB)',
    lengthM: 4.8, widthM: 2.0, heightM: 2.5, gvwT: 3.0,
    minDriveWidthM: 2.8, outerTurningRadiusM: 5.8, innerTurningRadiusM: 2.2,
    minThreePointTurnDiameterM: 9.0, hgvRouting: false, requiresAccessPermit: false,
  },
  lwb_van: {
    id: 'lwb_van', label: 'LWB Van (e.g. Transit LWB)',
    lengthM: 5.5, widthM: 2.0, heightM: 2.5, gvwT: 3.5,
    minDriveWidthM: 3.0, outerTurningRadiusM: 6.4, innerTurningRadiusM: 2.4,
    minThreePointTurnDiameterM: 10.5, hgvRouting: false, requiresAccessPermit: false,
  },
  luton_van: {
    id: 'luton_van', label: 'Luton Box Van',
    lengthM: 6.0, widthM: 2.1, heightM: 3.5, gvwT: 3.5,
    minDriveWidthM: 3.2, outerTurningRadiusM: 7.2, innerTurningRadiusM: 2.6,
    minThreePointTurnDiameterM: 12.0, hgvRouting: false, requiresAccessPermit: false,
  },
  tipper_swb: {
    id: 'tipper_swb', label: 'Tipper SWB',
    lengthM: 5.0, widthM: 2.1, heightM: 2.6, gvwT: 3.5,
    minDriveWidthM: 3.0, outerTurningRadiusM: 6.2, innerTurningRadiusM: 2.3,
    minThreePointTurnDiameterM: 10.0, hgvRouting: false, requiresAccessPermit: false,
  },
  tipper_lwb: {
    id: 'tipper_lwb', label: 'Tipper LWB',
    lengthM: 6.2, widthM: 2.2, heightM: 2.8, gvwT: 3.5,
    minDriveWidthM: 3.2, outerTurningRadiusM: 7.0, innerTurningRadiusM: 2.5,
    minThreePointTurnDiameterM: 11.5, hgvRouting: false, requiresAccessPermit: false,
  },
  '7_5t_rigid': {
    id: '7_5t_rigid', label: '7.5t Rigid',
    lengthM: 7.5, widthM: 2.4, heightM: 3.5, gvwT: 7.5,
    minDriveWidthM: 3.5, outerTurningRadiusM: 9.0, innerTurningRadiusM: 3.0,
    minThreePointTurnDiameterM: 15.0, hgvRouting: true, requiresAccessPermit: false,
  },
  '18t_rigid': {
    id: '18t_rigid', label: '18t Rigid',
    lengthM: 10.0, widthM: 2.5, heightM: 4.0, gvwT: 18.0,
    minDriveWidthM: 3.8, outerTurningRadiusM: 11.5, innerTurningRadiusM: 3.5,
    minThreePointTurnDiameterM: 20.0, hgvRouting: true, requiresAccessPermit: false,
  },
  '26t_rigid': {
    id: '26t_rigid', label: '26t Rigid',
    lengthM: 12.0, widthM: 2.55, heightM: 4.0, gvwT: 26.0,
    minDriveWidthM: 4.0, outerTurningRadiusM: 13.5, innerTurningRadiusM: 4.0,
    minThreePointTurnDiameterM: 24.0, hgvRouting: true, requiresAccessPermit: false,
  },
  artic_13_6m: {
    id: 'artic_13_6m', label: 'Artic (13.6m trailer)',
    lengthM: 16.5, widthM: 2.55, heightM: 4.2, gvwT: 44.0,
    minDriveWidthM: 4.5, outerTurningRadiusM: 14.5, innerTurningRadiusM: 4.5,
    minThreePointTurnDiameterM: 30.0, hgvRouting: true, requiresAccessPermit: true,
  },
  artic_15_5m: {
    id: 'artic_15_5m', label: 'Artic (15.5m mega-trailer)',
    lengthM: 18.75, widthM: 2.55, heightM: 4.2, gvwT: 44.0,
    minDriveWidthM: 4.8, outerTurningRadiusM: 16.0, innerTurningRadiusM: 5.0,
    minThreePointTurnDiameterM: 34.0, hgvRouting: true, requiresAccessPermit: true,
  },
  car_trailer: {
    id: 'car_trailer', label: 'Car + Trailer',
    lengthM: 9.5, widthM: 2.0, heightM: 1.8, gvwT: 3.5,
    minDriveWidthM: 3.0, outerTurningRadiusM: 11.0, innerTurningRadiusM: 3.5,
    minThreePointTurnDiameterM: 18.0, hgvRouting: false, requiresAccessPermit: false,
  },
  horse_trailer: {
    id: 'horse_trailer', label: 'Car + Horse Trailer',
    lengthM: 10.5, widthM: 2.2, heightM: 2.8, gvwT: 4.5,
    minDriveWidthM: 3.3, outerTurningRadiusM: 12.5, innerTurningRadiusM: 4.0,
    minThreePointTurnDiameterM: 20.0, hgvRouting: false, requiresAccessPermit: false,
  },
  caravan_7m: {
    id: 'caravan_7m', label: 'Car + 7m Caravan',
    lengthM: 11.5, widthM: 2.3, heightM: 2.7, gvwT: 4.5,
    minDriveWidthM: 3.3, outerTurningRadiusM: 13.0, innerTurningRadiusM: 4.2,
    minThreePointTurnDiameterM: 21.0, hgvRouting: false, requiresAccessPermit: false,
  },
  minibus: {
    id: 'minibus', label: 'Minibus (up to 17 seats)',
    lengthM: 6.5, widthM: 2.1, heightM: 2.8, gvwT: 5.0,
    minDriveWidthM: 3.2, outerTurningRadiusM: 8.5, innerTurningRadiusM: 3.0,
    minThreePointTurnDiameterM: 14.0, hgvRouting: false, requiresAccessPermit: false,
  },
  coach: {
    id: 'coach', label: 'Full-Size Coach',
    lengthM: 12.0, widthM: 2.55, heightM: 4.0, gvwT: 18.0,
    minDriveWidthM: 4.0, outerTurningRadiusM: 13.0, innerTurningRadiusM: 4.0,
    minThreePointTurnDiameterM: 24.0, hgvRouting: true, requiresAccessPermit: false,
  },
};

export const ALL_VEHICLE_IDS = Object.keys(VEHICLE_PROFILES) as VehicleId[];
