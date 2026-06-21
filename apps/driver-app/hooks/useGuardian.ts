/**
 * useGuardian Hook
 * 
 * Integrates the Driver Guardian Intelligence Layer with the React Native app.
 * Fetches guardian assessments for the current stop.
 */

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../lib/api';
import { useShiftStore } from '../store/shift';
import type { DriverGuardianResult, NotificationDecision, NotificationPriority } from '../../services/driver-guardian/types';

interface UseGuardianResult {
  guardianResult: DriverGuardianResult | null;
  notification: NotificationDecision | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch guardian assessment for the current stop.
 */
export function useGuardian(): UseGuardianResult {
  const [guardianResult, setGuardianResult] = useState<DriverGuardianResult | null>(null);
  const [notification, setNotification] = useState<NotificationDecision | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const shift = useShiftStore(s => s.shift);
  const currentStop = useShiftStore(s => s.currentStop);
  
  const fetchGuardian = useCallback(async () => {
    if (!shift || !currentStop) {
      setGuardianResult(null);
      setNotification(null);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/guardian/stop/${currentStop.id}`, {
        headers: {
          'Authorization': `Bearer ${shift.driverToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch guardian assessment');
      }
      
      const data = await response.json();
      
      if (data.ok && data.data) {
        setGuardianResult(data.data.result);
        setNotification(data.data.notification);
      }
    } catch (err) {
      // Non-fatal - guardian is optional
      console.log('[guardian] Assessment failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setGuardianResult(null);
      setNotification(null);
    } finally {
      setIsLoading(false);
    }
  }, [shift, currentStop]);
  
  // Fetch on mount and when stop changes
  useEffect(() => {
    fetchGuardian();
  }, [fetchGuardian]);
  
  // Refresh function for manual refresh
  const refresh = useCallback(() => {
    fetchGuardian();
  }, [fetchGuardian]);
  
  return {
    guardianResult,
    notification,
    isLoading,
    error,
    refresh,
  };
}

/**
 * Get priority badge configuration for display.
 */
export function getPriorityBadge(priority: NotificationPriority): {
  show: boolean;
  icon: string;
  color: string;
  bgColor: string;
  label: string;
} {
  switch (priority) {
    case 'ACTION_REQUIRED':
      return {
        show: true,
        icon: '⚠️',
        color: '#fff',
        bgColor: '#ef4444',
        label: 'Action Required',
      };
    case 'INFORM':
      return {
        show: true,
        icon: 'ℹ️',
        color: '#1e293b',
        bgColor: '#f1f5f9',
        label: 'Info',
      };
    case 'SILENT':
    default:
      return {
        show: false,
        icon: '',
        color: '',
        bgColor: '',
        label: '',
      };
  }
}
