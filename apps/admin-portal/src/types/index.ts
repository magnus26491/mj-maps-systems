// apps/admin-portal/src/types/index.ts
// Shared TypeScript types for the admin portal

export interface Admin {
  id: string;
  email: string;
  isOwner: boolean;
  isActive: boolean;
  createdAt: string;
  lastLogin: string | null;
}

export interface User {
  id: string;
  email: string;
  role: 'driver' | 'dispatcher' | 'admin';
  planId: 'navigation' | 'custom';
  planStatus: 'free' | 'trialing' | 'active' | 'past_due' | 'canceled';
  subscriptionTier?: string;
  isActive: boolean;
  isOwner: boolean;
  trialEndsAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  activeRouteCount?: number;
  organisationId?: string;
  organisationName?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

export interface Ticket {
  id: string;
  userId: string;
  userEmail: string;
  subject: string;
  body?: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assigneeId?: string | null;
  assigneeEmail?: string | null;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
}

export interface TicketMessage {
  id: string;
  authorId?: string;
  authorEmail: string;
  authorIsAdmin: boolean;
  body: string;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Overview {
  users: {
    total: number;
    owners: number;
    admins: number;
    drivers: number;
    dispatchers: number;
    inactive: number;
  };
  plans: Array<{ planId: string; planStatus: string; count: number }>;
  trials: { onTrial: number };
  newSignups: { last7d: number; last30d: number };
  tickets: { open: number };
  errors24h: number;
  dbSize: string;
  dbBytes: number;
  uptimeSeconds: number;
  timestamp: string;
}

export interface Subscription {
  id: string;
  userId: string;
  userEmail: string;
  planId: string;
  planStatus: string;
  trialEndsAt?: string;
  expiresAt?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: string | null;
  ipAddress: string | null;
  impersonating: boolean;
  impersonatedUserId: string | null;
  createdAt: string;
}

export interface AdminOverview {
  ok: boolean;
  overview: Overview;
}
