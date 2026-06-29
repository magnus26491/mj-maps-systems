/**
 * useGuardian Hook
 * 
 * Integrates the Driver Guardian Intelligence Layer with the React Native app.
 * Fetches guardian assessments for the current stop.
 */

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../lib/api';
import { useShiftStore } from '../store/shift';
import { useAuthStore } from '../lib/auth';
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
  const token = useAuthStore(s => s.token);

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
          'Authorization': `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
        },
      });

      // Guardian endpoint may not exist yet — treat 404 as non-fatal empty result
      if (response.status === 404) {
        setGuardianResult(null);
        setNotification(null);
        return;
      }

      if (!response.ok) {
        // Non-fatal — guardian is optional; swallow the error silently
        setGuardianResult(null);
        setNotification(null);
        return;
      }

      const data = await response.json();

      if (data.ok && data.data) {
        setGuardianResult(data.data.result);
        setNotification(data.data.notification);
      } else {
        setGuardianResult(null);
        setNotification(null);
      }
    } catch (err) {
      // Non-fatal - guardian is optional; network errors are silenced
      console.log('[guardian] Assessment unavailable:', err);
      setGuardianResult(null);
      setNotification(null);
    } finally {
      setIsLoading(false);
    }
  }, [shift, currentStop, token]);
  
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
