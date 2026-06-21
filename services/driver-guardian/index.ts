/**
 * Driver Guardian Intelligence Layer
 * 
 * "It should silently analyse everything.
 * The driver should only hear:
 *  - 'Turn here.'
 *  - 'Park here.'
 *  - 'Use this entrance.'
 *  - 'Leave before this becomes a problem.'
 * Nothing else."
 * 
 * 
 * This service aggregates all intelligence sources into a unified
 * driver protection score with minimal cognitive load.
 * 
 * Usage:
 * import { assessGuardian, makeNotificationDecision } from './services/driver-guardian';
 */

// ─── Main Engine ────────────────────────────────────────────────────────────────

export {
  assessGuardian,
  assessRouteGuardian,
  makeNotificationDecision,
  type GuardianInput,
  type GuardianRisk,
  type RiskSeverity,
  type RiskCategory,
  type DriverGuardianResult,
  type NotificationPriority,
  type NotificationDecision,
} from './guardian-engine';

// ─── Parking Protection ────────────────────────────────────────────────────────

export {
  calculateParkingPenaltyRisk,
  getParkingAdvice,
  type ParkingPenaltyRisk,
} from './parking-protection';

// ─── Environmental Intelligence ────────────────────────────────────────────────

export {
  assessEnvironmentalConditions,
  type EnvironmentalRisk,
} from './environmental-intelligence';

// ─── Re-export existing intelligence types ─────────────────────────────────────

export type {
  TrafficProfile,
  SchoolZone,
} from '../../traffic-engine/index';

export {
  getTrafficProfile,
  assessSchoolZoneRisk,
} from '../../traffic-engine/index';

export type {
  ParkingSpot,
  ParkingResult,
  ParkingType,
} from '../../parking-engine/src/index';

export {
  scoreParkingSpot,
  selectBestSpot,
} from '../../parking-engine/src/index';
