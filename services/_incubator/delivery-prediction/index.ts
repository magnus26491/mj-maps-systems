/**
 * Delivery Prediction Engine
 * 
 * Unified prediction layer for MJ Maps predictive delivery navigation.
 * 
 * Usage:
 * import { predictDelivery, predictRoute, toSmartNotification } from './services/delivery-prediction';
 */

// ─── Main Engine ────────────────────────────────────────────────────────────────

export {
  predictDelivery,
  predictRoute,
  toSmartNotification,
  type PredictionRequest,
  type DeliveryPrediction,
  type PredictionRiskFactor,
  type PredictionAction,
  type RoutePrediction,
} from './engine';

// ─── Stop Digital Model ──────────────────────────────────────────────────────────

export {
  buildStopModel,
  updateStopModel,
  getModelSummary,
  type StopDigitalModel,
} from './stop-model';

// ─── Accuracy Tracking ───────────────────────────────────────────────────────────

export {
  storePredictionResult,
  getAccuracyMetrics,
  calculateAccuracyScore,
  checkCalibration,
  type PredictionResult,
} from './accuracy';

// ─── Notification Helpers ─────────────────────────────────────────────────────────

export {
  type SmartNotification,
} from './types';
