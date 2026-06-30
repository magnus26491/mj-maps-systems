/** Stub types — driver-guardian service (planned, not yet implemented). */

export interface GuardianRisk {
  category:        string;
  severity:        'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason?:         string;
  driverAction?:   string;
  alternative?:    string;
  expectedImpact?: string;
}

export interface DriverGuardianResult {
  stopId:          string;
  risks:           GuardianRisk[];
  overallSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence:      number;
}

export type NotificationPriority = 'SILENT' | 'INFO' | 'INFORM' | 'ACTION_REQUIRED' | 'URGENT';

export interface NotificationDecision {
  priority:   NotificationPriority;
  title:      string;
  message:    string;
  shouldShow: boolean;
}
