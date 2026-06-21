/**
 * Intelligent Notification System
 * 
 * Unified notification priority system.
 * Levels: SILENT, INFO, ACTION_REQUIRED, URGENT
 * 
 * Rules:
 * - SILENT: No UI (small ETA changes, route optimization)
 * - INFO: Small non-blocking message (parking easier from rear)
 * - ACTION_REQUIRED: Driver needs to choose
 * - URGENT: Road closed, impossible delivery, safety issue
 */

import type { SmartNotification } from '../../services/delivery-prediction/types';
import type { DriverGuardianResult } from '../../services/driver-guardian/types';
import type { UnifiedWarning } from './driver-language';
import { translateUnifiedWarning } from './driver-language';

export type NotificationPriority = 'SILENT' | 'INFO' | 'ACTION_REQUIRED' | 'URGENT';

export interface Notification {
  id: string;
  priority: NotificationPriority;
  title: string;
  message: string;
  category: 'PARKING' | 'ACCESS' | 'TRAFFIC' | 'WEATHER' | 'DELIVERY' | 'ENVIRONMENTAL';
  icon: string;
  actionLabel?: string;
  voicePrompt?: string;
  canDismiss: boolean;
  requiresAcknowledgment: boolean;
  autoDismissSeconds: number;
  createdAt: Date;
}

// ─── Notification Rules ─────────────────────────────────────────────────────────

interface NotificationRule {
  priority: NotificationPriority;
  title: string;
  icon: string;
  messageBuilder: (warning: UnifiedWarning) => string;
  actionLabel?: string;
  canDismiss: boolean;
  autoDismissSeconds: number;
}

const NOTIFICATION_RULES: Record<string, NotificationRule> = {
  PARKING_CRITICAL: {
    priority: 'ACTION_REQUIRED',
    title: '⚠️ PARKING',
    icon: '⚠️',
    messageBuilder: (w) => `${w.message}. ${w.recommendation}`,
    canDismiss: false,
    autoDismissSeconds: 0,
  },
  ACCESS_ACTION: {
    priority: 'ACTION_REQUIRED',
    title: '⚠️ ACCESS',
    icon: '⚠️',
    messageBuilder: (w) => w.recommendation,
    canDismiss: false,
    autoDismissSeconds: 0,
  },
  TRAFFIC_ALTERNATIVE: {
    priority: 'ACTION_REQUIRED',
    title: '⚠️ ROUTE',
    icon: '⚠️',
    messageBuilder: (w) => `${w.message}. ${w.recommendation}`,
    actionLabel: 'Change',
    canDismiss: true,
    autoDismissSeconds: 15,
  },
  WEATHER_INFO: {
    priority: 'INFO',
    title: '🌧️ WEATHER',
    icon: '🌧️',
    messageBuilder: (w) => `${w.message}. ${w.recommendation}`,
    canDismiss: true,
    autoDismissSeconds: 10,
  },
  DELIVERY_INFO: {
    priority: 'INFO',
    title: 'ℹ️ INFO',
    icon: 'ℹ️',
    messageBuilder: (w) => w.message,
    canDismiss: true,
    autoDismissSeconds: 8,
  },
  ROAD_CLOSED: {
    priority: 'URGENT',
    title: '🚫 ROAD CLOSED',
    icon: '🚫',
    messageBuilder: (w) => 'Route changed automatically.',
    actionLabel: 'View',
    canDismiss: false,
    autoDismissSeconds: 0,
  },
  SAFETY_ISSUE: {
    priority: 'URGENT',
    title: '⚠️ SAFETY',
    icon: '⚠️',
    messageBuilder: (w) => w.message,
    canDismiss: false,
    autoDismissSeconds: 0,
  },
};

// ─── Notification Builder ───────────────────────────────────────────────────────

/**
 * Build notification from unified warning.
 */
export function buildNotification(warning: UnifiedWarning | null): Notification | null {
  if (!warning) {
    return null;
  }
  
  const { priority, category, title, message, recommendation, icon } = warning;
  
  // Map to notification rule
  const ruleKey = getRuleKey(priority, category, warning);
  const rule = NOTIFICATION_RULES[ruleKey] ?? NOTIFICATION_RULES.DELIVERY_INFO;
  
  return {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    priority: rule.priority,
    title: title || rule.title,
    message: rule.messageBuilder(warning),
    category,
    icon: rule.icon || icon,
    actionLabel: rule.actionLabel,
    canDismiss: rule.canDismiss,
    requiresAcknowledgment: rule.priority === 'ACTION_REQUIRED' || rule.priority === 'URGENT',
    autoDismissSeconds: rule.autoDismissSeconds,
    createdAt: new Date(),
  };
}

/**
 * Build SILENT notification (no UI, just log).
 */
export function buildSilentNotification(
  message: string,
  category: string
): Notification | null {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[notification:SILENT] ${category}: ${message}`);
  }
  return null;
}

function getRuleKey(
  priority: NotificationPriority,
  category: UnifiedWarning['category'],
  warning: UnifiedWarning
): string {
  // URGENT always uses urgent rules
  if (priority === 'URGENT') {
    if (category === 'ENVIRONMENTAL') return 'SAFETY_ISSUE';
    if (warning.message.toLowerCase().includes('closed')) return 'ROAD_CLOSED';
    return 'SAFETY_ISSUE';
  }
  
  // Map by category and priority
  const key = `${category}_${priority}`;
  
  // Specific rules for certain categories
  if (category === 'PARKING' && priority === 'ACTION_REQUIRED') {
    return 'PARKING_CRITICAL';
  }
  
  if (category === 'ACCESS' && priority === 'ACTION_REQUIRED') {
    return 'ACCESS_ACTION';
  }
  
  if (category === 'TRAFFIC' && priority === 'ACTION_REQUIRED') {
    return 'TRAFFIC_ALTERNATIVE';
  }
  
  return key;
}

// ─── Notification from Guardian ─────────────────────────────────────────────────

/**
 * Build notification from guardian result.
 */
export function notificationFromGuardian(
  guardian: DriverGuardianResult | null
): Notification | null {
  if (!guardian) {
    return null;
  }
  
  const warning = translateUnifiedWarning(null, guardian);
  return buildNotification(warning);
}

// ─── Notification Filter ────────────────────────────────────────────────────────

/**
 * Filter notifications based on rules.
 * Returns only notifications that should be shown to driver.
 */
export function filterNotifications(
  notifications: Notification[]
): Notification[] {
  // Filter by priority - only show highest priority
  const sorted = [...notifications].sort((a, b) => {
    const priorityOrder = ['URGENT', 'ACTION_REQUIRED', 'INFO', 'SILENT'];
    return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
  });
  
  // Return only the highest priority notification
  const highest = sorted[0];
  
  if (!highest || highest.priority === 'SILENT') {
    return [];
  }
  
  return [highest];
}

// ─── Voice Integration ────────────────────────────────────────────────────────

/**
 * Convert notification to voice prompt.
 */
export function toVoicePrompt(notification: Notification | null): string | null {
  if (!notification) {
    return null;
  }
  
  if (notification.priority === 'SILENT') {
    return null;
  }
  
  // Short, clear voice instructions
  let prompt = notification.message;
  
  if (notification.priority === 'URGENT') {
    prompt = `Alert. ${notification.message}`;
  } else if (notification.priority === 'ACTION_REQUIRED') {
    if (notification.actionLabel) {
      prompt = `${notification.message}. Press ${notification.actionLabel} to confirm.`;
    } else {
      prompt = notification.message;
    }
  } else {
    // INFO - just state the message
    prompt = notification.message;
  }
  
  return prompt;
}

/**
 * Get voice responses for notification.
 */
export function getVoiceResponses(
  notification: Notification | null
): string[] | null {
  if (!notification) {
    return null;
  }
  
  if (notification.priority === 'SILENT') {
    return null;
  }
  
  if (notification.requiresAcknowledgment) {
    return notification.actionLabel 
      ? ['Accept', 'Dismiss', notification.actionLabel]
      : ['Accept', 'Dismiss'];
  }
  
  return ['Dismiss'];
}
