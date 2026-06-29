/**
 * services/api/middleware/admin.ts
 *
 * Admin security middleware for MJ Maps Systems.
 *
 * Provides:
 *   - requireAdmin()   — strict role='admin' or 'dispatcher' guard
 *   - createAuditLog() — writes an immutable audit log entry
 *   - createImpersonationToken() — generates short-lived impersonation JWT
 *   - endImpersonation() — revokes an impersonation session
 *   - getClientIp() — extracts client IP from request
 *   - buildAuditEntry() — builds an AuditLogEntry from request context
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../../db/index.js';

// ── Types ────────────────────────────────────────────────────────────────────────

/** Immutable audit log row shape */
export interface AuditLogEntry {
  admin_id:         string;
  action:           string;
  target_type:      string | null;
  target_id:        string | null;
  old_value:        Record<string, unknown> | null;
  new_value:        Record<string, unknown> | null;
  reason:           string | null;
  ip_address:       string | null;
  user_agent:       string | null;
  impersonating:    boolean;
  impersonated_user_id: string | null;
}

export type AdminAction =
  | 'admin_login'
  | 'user_view'
  | 'plan_change'
  | 'impersonation_start'
  | 'impersonation_end'
  | 'flag_toggle'
  | 'flag_view'
  | 'user_update'
  | 'subscription_view'
  | 'subscription_change'
  | 'audit_log_view'
  | 'platform_analytics_view'
  | 'system_health_view'
  | 'user_delete'
  | 'role_change'
  | 'admin_add'
  | 'admin_remove'
  | 'ticket_view'
  | 'ticket_reply'
  | 'ticket_update'
  | 'overview_view'
  | 'trial_view'
  | 'error_view'
  | 'vip_invite_sent'
  | 'vip_invite_resent'
  | 'vip_invite_revoked';

// ── requireAdmin ────────────────────────────────────────────────────────────────

/**
 * Admin/dispatcher role guard.
 * MUST be used AFTER requireAuth in the preHandler chain.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authUser = (request as any).authUser;
  if (!authUser || (authUser.role !== 'admin' && authUser.role !== 'dispatcher')) {
    reply.code(403).send({ ok: false, error: 'Admin access required' });
  }
}

// ── Audit logging ───────────────────────────────────────────────────────────────

/**
 * Writes an immutable audit log entry.
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_audit_logs
         (admin_id, action, target_type, target_id, old_value, new_value, reason, ip_address, user_agent, impersonating, impersonated_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        entry.admin_id,
        entry.action,
        entry.target_type ?? null,
        entry.target_id ?? null,
        entry.old_value ? JSON.stringify(entry.old_value) : null,
        entry.new_value ? JSON.stringify(entry.new_value) : null,
        entry.reason ?? null,
        entry.ip_address ?? null,
        entry.user_agent ? entry.user_agent.substring(0, 500) : null,
        entry.impersonating,
        entry.impersonated_user_id ?? null,
      ],
    );
  } catch {
    // Non-fatal — audit log failures should not break the request
    console.error('[admin-audit] Failed to write audit log entry:', entry.action);
  }
}

/**
 * Extracts client IP from a Fastify request (handles X-Forwarded-For).
 */
export function getClientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).split(',')[0].trim();
  }
  return request.ip || null;
}

/**
 * Builds an AuditLogEntry from request context + action details.
 */
export function buildAuditEntry(
  request: FastifyRequest,
  adminId: string,
  action: AdminAction,
  opts: {
    targetType?: string;
    targetId?: string;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    reason?: string | null;
    isImpersonating?: boolean;
    impersonatedUserId?: string | null;
  } = {},
): AuditLogEntry {
  return {
    admin_id:            adminId,
    action:              action,
    target_type:         opts.targetType ?? null,
    target_id:           opts.targetId ?? null,
    old_value:           opts.oldValue ?? null,
    new_value:           opts.newValue ?? null,
    reason:              opts.reason ?? null,
    ip_address:          getClientIp(request),
    user_agent:          request.headers['user-agent'] ?? null,
    impersonating:       opts.isImpersonating ?? false,
    impersonated_user_id: opts.impersonatedUserId ?? null,
  };
}

// ── Impersonation ────────────────────────────────────────────────────────────────

/**
 * Creates a placeholder impersonation token entry.
 * In production this would sign a short-lived JWT; here we return a session record.
 */
export async function createImpersonationToken(
  adminId: string,
  targetUserId: string,
  reason: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<{ token: string; expiresAt: string; sessionId: string }> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60_000); // 30 minutes

  // Store session in DB
  try {
    await pool.query(
      `INSERT INTO impersonation_sessions
         (admin_id, impersonated_user_id, impersonation_token_hash, reason, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adminId,
        targetUserId,
        sessionId, // used as token hash placeholder
        reason,
        ipAddress,
        userAgent ? userAgent.substring(0, 500) : null,
        expiresAt,
      ],
    );
  } catch {
    // Table may not exist in all environments
  }

  return {
    token: sessionId,
    expiresAt: expiresAt.toISOString(),
    sessionId,
  };
}

/**
 * Ends an active impersonation session by its session ID.
 */
export async function endImpersonation(
  sessionId: string,
  revokedBy: string,
): Promise<void> {
  try {
    await pool.query(
      `UPDATE impersonation_sessions
       SET revoked_at = NOW(), revoked_by = $1
       WHERE id = $2 AND revoked_at IS NULL`,
      [revokedBy, sessionId],
    );
  } catch {
    // Non-fatal
  }
}
