/**
 * Delivery Copilot Service
 * 
 * The autonomous decision layer above existing intelligence.
 * Consumes all Phase 17-18 systems to make driver-first decisions.
 * 
 * Usage:
 * import { generateCopilotDecision, generateArrivalBriefing } from './services/delivery-copilot';
 */

export {
  generateCopilotDecision,
  generateArrivalBriefing,
  calculateDynamicConfidence,
  decisionToNotification,
  type CopilotDecision,
  type CopilotAction,
  type NotificationLevel,
  type CopilotContext,
  type StopContext,
  type ArrivalBriefing,
  type DynamicConfidence,
  type VehicleProfile,
  type VehicleRestriction,
} from './decision-engine';

export {
  getVehicleProfile,
  getAllVehicleProfiles,
  assessVehicleAccess,
  validateRouteForVehicle,
  generateVehicleBriefing,
  VEHICLE_PROFILES,
  type VehicleAssessment,
} from '../vehicle-intelligence/index';
