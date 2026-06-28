/**
 * services/api/middleware/admin.ts
 *
 * Admin security middleware for MJ Maps Systems.
 *
 * Provides:
 *   - requireAdmin()   — strict role='admin' guard (additive to requireAuth)
 *   - requireImpersonationClear() — blocks impersonation tokens from admin routes
 *   - createAuditLog()           — writes an immutable audit log entry
 *   - createImpersonationToken() — generates short-lived impersonation JWT
 *   - verifyImpersonationToken() — validates impersonation session is still active
 *
 * All admin routes must use BOTH requireAuth AND requireAdmin (in that order).
 *
 * Security invariants:
 *   - Impersonation tokens are max 30 minutes, stored as SHA-256 hashes in DB
 *   - Audit logs are immutable — no UPDATE/DELETE allowed at DB level
 *   - Admin impersonation sessions are revoked on admin logout or account deletion
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../../db/index.js';
import { requireAuth, type AuthUser } from './auth.js';

// ── Types ────────────────────────────────────────────────────────────────────────

export interface ImpersonationPayload {
  originalAdminId: string;
  impersonatedUserId: string;
  impersonationSessionId: string;
  role: string;   // always the impersonated user's role
  planId: string;
  iat: number;
  exp: number;
}

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
 * Strict admin role guard.
 * MUST be used AFTER requireAuth in the preHandler chain.
 * Rejects: role='driver', role='dispatcher', unauthenticated, impersonation tokens.
 *
 * Chain order: preHandler: [requireAuth, requireAdmin]
 */
export function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
): void {
  // requireAuth already attached authUser
  const authUser = (request as unknown as { authUser?: AuthUser }).authUser;
  if (!authUser) {
    reply.code(401).send({ ok: false, error: 'Unauthorized' });
    done();
    return;
  }

  // Reject impersonation tokens on admin routes — admin-only scope
  if (authUser.isImpersonation) {
    reply.code(403).send({
      ok: false,
      error: 'Impersonation tokens cannot access admin endpoints',
      code: 'ADMIN_REQUIRED',
    });
    done();
    return;
  }

  if (authUser.role !== 'admin') {
    reply.code(403).send({
      ok: false,
      error: 'Admin access required',
      code: 'ADMIN_REQUIRED',
    });
    done();
    return;
  }


}

/**
 * Owner-only guard.
 * MUST be used AFTER requireAdmin in the preHandler chain.
 * Rejects: non-owners, impersonation tokens (which never have owner privileges).
 */
export function requireOwner(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
): void {
  const authUser = (request as unknown as { authUser?: AuthUser }).authUser;
  if (!authUser) {
    reply.code(401).send({ ok: false, error: 'Unauthorized' });
    done();
    return;
  }
  if (!authUser.isOwner) {
    reply.code(403).send({
      ok: false,
      error: 'Owner access required',
      code: 'OWNER_REQUIRED',
    });
    done();
    return;
  }
  done();
}

// ── Impersonation tokens ────────────────────────────────────────────────────────

const IMPERSONATION_TOKEN_TTL_MINUTES = 30;
const JWT_SECRET = process.env.JWT_SECRET ?? 'changeme_insecure_default';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a short-lived impersonation JWT and records the session in the DB.
 * Token expires in 30 minutes. The session can be revoked by ending impersonation.
 *
 * Returns: { token: string, expiresAt: string, sessionId: string }
 */
export async function createImpersonationToken(
  adminId: string,
  targetUserId: string,
  reason: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<{ token: string; expiresAt: string; sessionId: string }> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + IMPERSONATION_TOKEN_TTL_MINUTES * 60_000);

  // Load target user to embed their role/plan in the token
  const { rows } = await pool.query<{
    id: string; role: string; plan_id: string; email: string; is_owner: boolean | null;
  }>(
    `SELECT id, role, COALESCE(plan_id, 'navigation') as plan_id, email, is_owner FROM users WHERE id = $1 AND is_active = TRUE`,
    [targetUserId],
  );

  if (!rows.length) {
    throw new Error('Target user not found or inactive');
  }

  const target = rows[0];

  // Sign the short-lived impersonation JWT
  const token = jwt.sign(
    {
      originalAdminId: adminId,
      impersonatedUserId: targetUserId,
      impersonationSessionId: sessionId,
      role:    target.role,
      planId:  target.plan_id,
      isOwner: target.is_owner ?? false,
      sub:     targetUserId,  // so standard middleware sees the impersonated user
    },
    JWT_SECRET,
    { expiresIn: `${IMPERSONATION_TOKEN_TTL_MINUTES}m` },
  );

  // Store hash + metadata in DB
  await pool.query(
    `INSERT INTO impersonation_sessions
       (admin_id, impersonated_user_id, impersonation_token_hash, reason, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      adminId,
      targetUserId,
      hashToken(token),
      reason,
      ipAddress ? ipAddress : null,
      userAgent ? userAgent.substring(0, 500) : null,
      expiresAt,
    ],
  );

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    sessionId,
  };
}

/**
 * Verifies an impersonation token is still valid (not expired, not revoked).
 * Returns the decoded payload on success; null on failure.
 */
export async function verifyImpersonationToken(
  token: string,
): Promise<ImpersonationPayload | null> {
  let payload: ImpersonationPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as ImpersonationPayload;
  } catch {
    return null;
  }

  // Check DB session is still active (not revoked, not expired)
  const { rows } = await pool.query<{ revoked_at: string | null; expires_at: string }>(
    `SELECT revoked_at, expires_at
     FROM impersonation_sessions
     WHERE id = $1 AND impersonation_token_hash = $2`,
    [payload.impersonationSessionId, hashToken(token)],
  );

  if (!rows.length) return null;
  const session = rows[0];
  if (session.revoked_at) return null;
  if (new Date(session.expires_at) < new Date()) return null;

  return payload;
}

/**
 * Ends an active impersonation session by its session ID.
 * Sets revoked_at so the token can no longer be used.
 */
export async function endImpersonation(
  sessionId: string,
  revokedBy: string,  // the admin ending the session (or 'system')
): Promise<void> {
  await pool.query(
    `UPDATE impersonation_sessions
     SET revoked_at = NOW(), revoked_by = $1
     WHERE id = $2 AND revoked_at IS NULL`,
    [revokedBy, sessionId],
  );
}

/**
 * Ends ALL active impersonation sessions for a given admin.
 * Called on admin logout.
 */
export async function revokeAllAdminImpersonations(adminId: string): Promise<void> {
  await pool.query(
    `UPDATE impersonation_sessions
     SET revoked_at = NOW(), revoked_by = $1
     WHERE admin_id = $1 AND revoked_at IS NULL`,
    [adminId],
  );
}

// ── Audit logging ───────────────────────────────────────────────────────────────

/**
 * Writes an immutable audit log entry.
 * This function should be called AFTER any sensitive admin action.
 * The DB trigger prevents UPDATE/DELETE on admin_audit_logs.
 *
 * @param entry All required audit fields
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO admin_audit_logs
       (admin_id, action, target_type, target_id, old_value, new_value, reason, ip_address, user_agent, impersonating, impersonated_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
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

  // Log to console (Railway captures stdout) — DB insertion is authoritative
  console.info('[admin-audit]', JSON.stringify({
    auditLogId: rows[0]?.id,
    action: entry.action,
    targetId: entry.target_id,
    adminId: entry.admin_id,
    impersonating: entry.impersonating,
  }));
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
 * Safe to call for any admin action.
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
  },
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
    user_agent:         request.headers['user-agent'] ?? null,
    impersonating:       opts.isImpersonating ?? false,
    impersonated_user_id: opts.impersonatedUserId ?? null,
  };
}

// ── Impersonation auth hook ────────────────────────────────────────────────────

/**
 * Fastify async onRequest hook for impersonation-protected routes.
 * Verifies the impersonation token, attaches impersonation context to req.authUser.
 * Must be used as the ONLY auth middleware (not with requireAuth).
 * Fastify natively supports async onRequest hooks — no done() callback needed.
 */
export async function requireImpersonation(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ ok: false, error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  const payload = await verifyImpersonationToken(token);

  if (!payload) {
    reply.code(401).send({
      ok: false,
      error: 'Impersonation session expired or revoked',
      code: 'IMPERSONATION_EXPIRED',
    });
    return;
  }

  // Attach impersonation context so requireAdmin can distinguish it
  (request as unknown as {
    authUser: AuthUser;
    impersonationContext?: ImpersonationPayload;
  }).authUser = {
    id:              payload.impersonatedUserId,
    role:            payload.role,
    planId:          payload.planId,
    isOwner:         false, // impersonation never grants owner privileges
    tier:            'custom',
    isImpersonation: true,  // signals requireAdmin to block this token
  };
  (request as unknown as { impersonationContext?: ImpersonationPayload }).impersonationContext = payload;
}
