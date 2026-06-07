/**
 * Route Engine — public API
 */
export { planRoute } from './route-planner';
export { runSequencer as sequenceStops } from './sequencer';
export { buildSweepZones } from './sweep-zones';
export { planStopApproach, planAllApproaches } from './approach-planner';
export { getDwellMinutes } from './time-aware-solver';
export { validateVehicleForJurisdiction, getJurisdiction, type JurisdictionRules, type DriveSide } from './jurisdiction-rules';
export {
  checkRouteForTidalRisks,
  checkTidalStatus,
  getRerouteMinutes,
  getDriveSideRiskModifier,
  KNOWN_TIDAL_SEGMENTS,
  REGION_PROFILES,
  type TidalRegionProfile,
  type TidalSegment,
  type TidalCheck,
  type TidalStatus,
  type TidalCycleType,
  type RoadRiskType,
  type VehicleClass,
} from './tidal-checker';
export {
  getBestDepartureWindow,
  getDepartureDelayMultiplier,
  DEPARTURE_WINDOWS,
  type DepartureWindow,
} from './departure-optimizer';
export {
  getVehicleConditionPenalty,
  ROAD_CONDITION_PENALTIES,
  type RoadCondition,
} from './traffic-weighting';
export type {
  StopPoint,
  Stop,
  SequencerInput,
  SequencerOutput,
  SweepZone,
  ApproachSide,
  TurnAroundMethod,
  ApproachedStop,
  PlannedRoute,
  LatLng,
  RouteConstraints,
  SolverInput,
  SolverResult,
  StopStatus,
  TimeWindow,
} from './types';
