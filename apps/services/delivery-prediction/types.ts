/** Stub types — delivery-prediction service (planned, not yet implemented). */

export interface RiskFactor {
  category:        string;
  severity:        'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description?:    string;
  expectedImpact?: string;
}

export interface DeliveryPrediction {
  stopId:                string;
  successRate:           number;
  riskFactors:           RiskFactor[];
  confidence:            number;
  completionProbability?: number;
  failureRisk?:          number;
  dataQuality?:          'HIGH' | 'MEDIUM' | 'LOW';
}

export interface SmartNotification {
  id:        string;
  priority:  'SILENT' | 'INFO' | 'ACTION_REQUIRED' | 'URGENT';
  title:     string;
  message:   string;
  category:  string;
  expiresAt?: string;
}
