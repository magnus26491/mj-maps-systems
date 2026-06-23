/**
 * Delivery Learning Service
 * 
 * Self-improving delivery intelligence system.
 * 
 * Services:
 * - outcome-capture: Record predictions and actuals
 * - prediction-analytics: Calculate accuracy metrics
 * - stop-memory: Persistent stop characteristics
 * - driver-profiles: Driver behavior learning
 * - simulation: Compare routing strategies
 * 
 * Usage:
 * import { storePrediction, recordOutcome } from './services/delivery-learning';
 */

// ─── Re-exports ────────────────────────────────────────────────────────────────

export {
  type StopPrediction,
  type StopOutcome,
  type PredictionWithOutcome,
  type DeliveryEventType,
  type DeliveryEvent,
  storePrediction,
  storePredictionBatch,
  recordOutcome,
  getRoutePredictionsWithOutcomes,
  recordEvent,
} from './outcome-capture';

export {
  type PredictionAccuracy,
  type AccuracyReport,
  type ConfidenceCalibration,
  type EtaAccuracy,
  type ParkingAccuracy,
  type CompletionAccuracy,
  calculateAccuracyReport,
  getAccuracyTrends,
} from './prediction-analytics';

export {
  type StopMemory,
  type StopMemoryInput,
  type StopWithMemory,
  getStopMemory,
  updateStopMemory,
  generateDeliveryTips,
  getStopMemoryBatch,
} from './stop-memory';

export {
  type DriverProfile,
  type DriverPerformance,
  getDriverProfile,
  updateDriverProfile,
  getDriverPerformance,
  getRouteRecommendation,
  learnFromBehavior,
} from './driver-profiles';

export {
  type SimulatedStop,
  type SimulatedRoute,
  type SimulationConfig,
  type SimulationResult,
  type SimulationReport,
  runSimulation,
  runQuickSimulation,
} from './simulation';
