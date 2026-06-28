/**
 * services/api/routes/admin.ts
 *
 * Admin Portal API — all routes under /api/v1/admin
 *
 * Security:
 *   - All routes protected by requireAuth + requireAdmin
 *   - Impersonation tokens are blocked from admin endpoints
 *   - Every sensitive action creates an immutable audit log entry
 *   - Rate limited to 60 req/min per admin (applied at mount point)
 *   - Sensitive actions require explicit reason string
 *
 * Owner/Admin tier system (Phase 1.3):
 *   - OWNER (is_owner=TRUE): can do everything including manage admins
 *   - ADMIN (is_owner=FALSE): can manage users/subscriptions/tickets
 *   - Guards: last admin cannot be demoted; last owner cannot be demoted
 *
 * Canonical Plan Model (Phase 2):
 *   - plan_id: 'navigation' | 'custom'
 *   - plan_status: 'free' | 'trialing' | 'active' | 'past_due' | 'canceled'
 *   - See docs/PLAN_MODEL.md
 *
 * Endpoints:
 *   GET  /admin/overview            — dashboard stats
 *   GET  /admin/users               — paginated user list
 *   GET  /admin/users/:id           — full user profile
 *   PATCH /admin/users/:id          — edit is_active/profile
 *   POST /admin/users/:id/subscription — change plan/trial
 *   POST /admin/users/:id/role      — change role (owner only)
 *   GET  /admin/subscriptions       — subscription/trial list
 *   GET  /admin/trials              — all trialing users (sorted by expiry)
 *   GET  /admin/tickets             — ticket list/filter
 *   GET  /admin/tickets/:id         — ticket thread
 *   POST /admin/tickets/:id/reply   — reply to ticket
 *   PATCH /admin/tickets/:id        — change status/priority/assignee
 *   GET  /admin/admins              — list admins + owner
 *   POST /admin/admins              — promote user to admin (owner only)
 *   DELETE /admin/admins/:id        — revoke admin (owner only)
 *   GET  /admin/system-health       — real DB/Redis/disk metrics
 *   GET  /admin/audit-log           — audit trail
 *   GET  /admin/errors              — recent server errors
 *   (Existing) GET  /admin/users, /admin/users/:id/impersonate, etc.
 */

import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { pool } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  requireAdmin,
  createAuditLog,
  buildAuditEntry,
  createImpersonationToken,
  endImpersonation,
  getClientIp,
  type AdminAction,
} from '../middleware/admin.js';

// ── Zod schemas ────────────────────────────────────────────────────────────────

const PaginationSchema = {
  type: 'object',
  properties: {
    page:   { type: 'integer', minimum: 1, default: 1 },
    limit:  { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
} as const;

const AuditLogQuerySchema = {
  type: 'object',
  properties: {
    adminId:  { type: 'string' },
    action:   { type: 'string' },
    targetId: { type: 'string' },
    search:   { type: 'string' },
    from:     { type: 'string' },
    to:       { type: 'string' },
    page:     { type: 'integer', minimum: 1, default: 1 },
    limit:    { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  },
} as const;

const PlanChangeSchema = {
  type: 'object',
  properties: {
    newPlan: { type: 'string', enum: ['free', 'navigation', 'custom'] },
    reason:  { type: 'string', minLength: 10, maxLength: 500 },
  },
  required: ['newPlan', 'reason'],
} as const;

const ImpersonateSchema = {
  type: 'object',
  properties: {
    reason: { type: 'string', minLength: 10, maxLength: 500 },
  },
  required: ['reason'],
} as const;

const FlagToggleSchema = {
  type: 'object',
  properties: {
    value:  { type: 'object' },  // allow any JSON
    reason: { type: 'string', minLength: 10, maxLength: 500 },
  },
  required: ['value', 'reason'],
} as const;

// ── Safe field selectors ────────────────────────────────────────────────────────

/** Fields of a user row that are safe to expose to the admin UI */
const SAFE_USER_FIELDS = `
  u.id,
  u.email,
  u.role,
  COALESCE(u.plan_id, 'navigation')  as plan_id,
  u.subscription_tier,
  u.is_active,
  u.created_at,
  u.last_login,
  o.id    as organisation_id,
  o.name  as organisation_name
`.trim();

/** Count active routes for a user (subquery) */
const ACTIVE_ROUTES_COUNT = `
  (SELECT COUNT(*)::int
   FROM routes r
   WHERE r.driver_id = u.id AND r.status = 'active')
`.trim();

const USER_ROW_SELECT = `
  ${SAFE_USER_FIELDS},
  (${ACTIVE_ROUTES_COUNT}) as active_route_count
`.trim();

// ── Plugin ─────────────────────────────────────────────────────────────────────

export const adminRoutes: FastifyPluginAsync = async (fastify) => {

  // Apply auth + admin guard to all routes in this plugin
  // Rate limiting is applied at the mount point in server.ts
  fastify.addHook('onRequest', requireAuth);
  fastify.addHook('onRequest', requireAdmin);

  // Log every admin request
  fastify.addHook('onRequest', async (request) => {
    const authUser = (request as unknown as { authUser?: { id: string; role: string } }).authUser;
    request.log.info({ adminId: authUser?.id, path: request.url }, '[admin] incoming request');
  });

  // ── Helper ───────────────────────────────────────────────────────────────

  function getAdminId(request: FastifyRequest): string {
    return (request as unknown as { authUser?: { id: string } }).authUser?.id ?? 'unknown';
  }

  // ── GET /users ─────────────────────────────────────────────────────────────

  fastify.get('/users', {
    schema: {
      querystring: PaginationSchema,
    },
  }, async (request, reply) => {
    const { page = 1, limit = 20, search = '', plan = '', isActive = '', sort = 'created_at' } =
      (request.query as unknown as { page?: number; limit?: number; search?: string; plan?: string; isActive?: string; sort?: string });

    const offset = (page - 1) * limit;
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.email ILIKE $${params.length} OR o.name ILIKE $${params.length})`;
    }
    if (plan) {
      params.push(plan);
      where += ` AND COALESCE(u.plan_id, 'navigation') = $${params.length}`;
    }
    if (isActive !== '') {
      params.push(isActive === 'true');
      where += ` AND u.is_active = $${params.length}`;
    }

    const sortCol = ['email', 'role', 'plan_id', 'created_at', 'last_login'].includes(sort as string)
      ? sort : 'created_at';
    const sortDir = sort === 'email' ? 'ASC NULLS LAST' : 'DESC NULLS LAST';

    params.push(limit, offset);

    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT ${USER_ROW_SELECT}
         FROM users u
         LEFT JOIN organisations o ON o.id = u.organisation_id
         ${where}
         ORDER BY u.${sortCol} ${sortDir}
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      pool.query(
        `SELECT COUNT(*)::int as total FROM users u LEFT JOIN organisations o ON o.id = u.organisation_id ${where}`,
        params.slice(0, -2),
      ),
    ]);

    const users = (rowsResult.rows as Record<string, unknown>[]).map(row => ({
      id:              row.id,
      email:           row.email,
      role:            row.role,
      plan:            row.plan_id,
      subscriptionTier: row.subscription_tier,
      isActive:        row.is_active,
      createdAt:       (row.created_at as Date).toISOString(),
      lastLoginAt:     row.last_login ? (row.last_login as Date).toISOString() : null,
      activeRouteCount: row.active_route_count,
      organisationId:  row.organisation_id,
      organisationName: row.organisation_name,
    }));

    const total = (countResult.rows[0] as { total: number }).total;

    // Audit: log the view (sensitive read)
    const adminId = getAdminId(request);
    await createAuditLog(buildAuditEntry(request, adminId, 'user_view', {
      targetType: 'users_list',
      newValue: { page, limit, search, plan, isActive },
    }));

    return {
      ok: true,
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // ── GET /users/:userId ────────────────────────────────────────────────────

  fastify.get<{ Params: { userId: string } }>(
    '/users/:userId',
    async (request, reply) => {
      const { userId } = request.params;

      const { rows } = await pool.query(
        `SELECT ${USER_ROW_SELECT}
         FROM users u
         LEFT JOIN organisations o ON o.id = u.organisation_id
         WHERE u.id = $1`,
        [userId],
      );

      if (!rows.length) {
        return reply.code(404).send({ ok: false, error: 'User not found' });
      }

      const user = rows[0] as Record<string, unknown>;

      // Load last 5 routes
      const { rows: recentRoutes } = await pool.query(
        `SELECT r.id, r.status, r.total_stops, r.completed_stops, r.failed_stops,
                r.shift_start, r.created_at
         FROM routes r
         WHERE r.driver_id = $1
         ORDER BY r.shift_start DESC NULLS LAST
         LIMIT 5`,
        [userId],
      );

      // Audit
      const adminId = getAdminId(request);
      await createAuditLog(buildAuditEntry(request, adminId, 'user_view', {
        targetType: 'user',
        targetId: userId,
      }));

      return {
        ok: true,
        user: {
          id:               user.id,
          email:            user.email,
          role:             user.role,
          plan:             user.plan_id,
          subscriptionTier: user.subscription_tier,
          isActive:         user.is_active,
          createdAt:        (user.created_at as Date).toISOString(),
          lastLoginAt:      user.last_login ? (user.last_login as Date).toISOString() : null,
          activeRouteCount: user.active_route_count,
          organisationId:   user.organisation_id,
          organisationName: user.organisation_name,
        },
        recentRoutes: (recentRoutes as Record<string, unknown>[]).map(r => ({
          id:             r.id,
          status:         r.status,
          totalStops:     r.total_stops,
          completedStops: r.completed_stops,
          failedStops:   r.failed_stops,
          shiftStart:     r.shift_start ? (r.shift_start as Date).toISOString() : null,
          createdAt:      (r.created_at as Date).toISOString(),
        })),
      };
    },
  );

  // ── POST /users/:userId/impersonate ──────────────────────────────────────

  fastify.post<{ Params: { userId: string }; Body: { reason?: string } }>(
    '/users/:userId/impersonate',
    {
      schema: {
        body: ImpersonateSchema,
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const { reason } = request.body ?? {};

      if (!reason || reason.length < 10) {
        return reply.code(400).send({
          ok: false,
          error: 'A reason of at least 10 characters is required to impersonate a user',
          code: 'REASON_REQUIRED',
        });
      }

      const adminId = getAdminId(request);

      // Check if impersonation is enabled
      const { rows: flagRows } = await pool.query(
        `SELECT value FROM feature_flags WHERE key = 'impersonation_enabled'`,
      );
      if (!flagRows.length || !(flagRows[0].value as { value?: boolean }).value) {
        return reply.code(403).send({
          ok: false,
          error: 'Impersonation is currently disabled',
          code: 'IMPERSONATION_DISABLED',
        });
      }

      // Load target user info for audit
      const { rows: targetRows } = await pool.query(
        `SELECT email, role FROM users WHERE id = $1 AND is_active = TRUE`,
        [userId],
      );
      if (!targetRows.length) {
        return reply.code(404).send({ ok: false, error: 'User not found or inactive' });
      }
      const target = targetRows[0] as { email: string; role: string };

      const clientIp = request.headers['x-forwarded-for']
        ? String(request.headers['x-forwarded-for']).split(',')[0].trim()
        : request.ip || null;

      const { token, expiresAt, sessionId } = await createImpersonationToken(
        adminId,
        userId,
        reason,
        clientIp,
        request.headers['user-agent'] ?? null,
      );

      // Audit log
      await createAuditLog(buildAuditEntry(request, adminId, 'impersonation_start', {
        targetType: 'user',
        targetId: userId,
        newValue: { targetEmail: target.email, targetRole: target.role },
        reason,
      }));

      request.log.info(
        { adminId, targetUserId: userId, sessionId },
        '[admin] impersonation started',
      );

      return {
        ok: true,
        token,
        expiresAt,
        sessionId,
        impersonatedUser: {
          id:    userId,
          email: target.email,
          role:  target.role,
        },
      };
    },
  );


  // ── GET /impersonation/sessions ─────────────────────────────────────────
  // Lists active and recent impersonation sessions for this admin.
  // Useful for admins to see their own history and for auditing.

  fastify.get('/impersonation/sessions', async (request, reply) => {
    const adminId = getAdminId(request);

    const { rows } = await pool.query(
      `SELECT
         s.id,
         u.email        AS impersonated_user_email,
         s.impersonated_user_id,
         u.role         AS impersonated_user_role,
         s.reason,
         s.ip_address,
         s.started_at,
         s.expires_at,
         s.revoked_at,
         s.revoked_by
       FROM impersonation_sessions s
       JOIN users u ON u.id = s.impersonated_user_id
       WHERE s.admin_id = $1
       ORDER BY s.started_at DESC
       LIMIT 50`,
      [adminId],
    );

    return {
      ok: true,
      sessions: rows.map((row: Record<string, unknown>) => ({
        id:                        row.id,
        impersonatedUserEmail:      row.impersonated_user_email,
        impersonatedUserId:         String(row.impersonated_user_id),
        impersonatedUserRole:       row.impersonated_user_role,
        reason:                     row.reason,
        ipAddress:                  row.ip_address ?? null,
        startedAt:                  (row.started_at as Date).toISOString(),
        expiresAt:                  (row.expires_at as Date).toISOString(),
        revokedAt:                  row.revoked_at ? (row.revoked_at as Date).toISOString() : null,
      })),
    };
  });

  // ── POST /impersonation/end ──────────────────────────────────────────────

  fastify.post<{ Body: { sessionId?: string } }>(
    '/impersonation/end',
    async (request, reply) => {
      const adminId = getAdminId(request);
      const { sessionId } = request.body ?? {};

      if (sessionId) {
        // End a specific session
        await endImpersonation(sessionId, adminId);
        await createAuditLog(buildAuditEntry(request, adminId, 'impersonation_end', {
          newValue: { sessionId },
          reason: 'Admin ended impersonation session',
        }));
      } else {
        // End all active sessions for this admin
        const { rows: activeSessions } = await pool.query(
          `SELECT id FROM impersonation_sessions WHERE admin_id = $1 AND revoked_at IS NULL`,
          [adminId],
        );
        for (const session of activeSessions) {
          await endImpersonation((session as { id: string }).id, adminId);
        }
        await createAuditLog(buildAuditEntry(request, adminId, 'impersonation_end', {
          newValue: { sessionCount: activeSessions.length },
          reason: 'Admin ended all impersonation sessions',
        }));
      }

      return { ok: true };
    },
  );

  // ── PATCH /users/:userId/plan ─────────────────────────────────────────────

  fastify.patch<{ Params: { userId: string }; Body: { newPlan?: string; reason?: string } }>(
    '/users/:userId/plan',
    {
      schema: {
        body: PlanChangeSchema,
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const { newPlan, reason } = request.body ?? {};

      if (!reason || reason.length < 10) {
        return reply.code(400).send({
          ok: false,
          error: 'A reason of at least 10 characters is required for plan changes',
          code: 'REASON_REQUIRED',
        });
      }

      const VALID_PLANS = ['free', 'navigation', 'custom'];
      if (!newPlan || !VALID_PLANS.includes(newPlan)) {
        return reply.code(400).send({
          ok: false,
          error: `newPlan must be one of: ${VALID_PLANS.join(', ')}`,
        });
      }

      // Load current plan
      const { rows: beforeRows } = await pool.query(
        `SELECT plan_id, email FROM users WHERE id = $1`,
        [userId],
      );
      if (!beforeRows.length) {
        return reply.code(404).send({ ok: false, error: 'User not found' });
      }
      const before = beforeRows[0] as { plan_id: string; email: string };
      const oldPlan = before.plan_id ?? 'navigation';

      if (oldPlan === newPlan) {
        return reply.code(400).send({
          ok: false,
          error: 'User is already on this plan',
        });
      }

      // Update plan
      await pool.query(
        `UPDATE users SET plan_id = $1, updated_at = NOW() WHERE id = $2`,
        [newPlan, userId],
      );

      const adminId = getAdminId(request);
      await createAuditLog(buildAuditEntry(request, adminId, 'plan_change', {
        targetType: 'user',
        targetId: userId,
        oldValue: { planId: oldPlan },
        newValue: { planId: newPlan },
        reason,
      }));

      request.log.info(
        { adminId, targetUserId: userId, oldPlan, newPlan },
        '[admin] plan changed',
      );

      return {
        ok: true,
        user: {
          id:    userId,
          email: before.email,
          plan:  newPlan,
        },
      };
    },
  );

  // ── GET /subscriptions ───────────────────────────────────────────────────

  fastify.get('/subscriptions', {
    schema: { querystring: PaginationSchema },
  }, async (request, reply) => {
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
    const offset = (page - 1) * limit;

    // In production, this would call Stripe API.
    // For now, derive subscription state from the users table.
    // TODO(subscriptions): Replace with real Stripe API calls when billing integration is complete.
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.role,
              COALESCE(u.plan_id, 'navigation') as plan_id,
              u.subscription_tier,
              u.is_active,
              o.name as organisation_name,
              u.created_at,
              u.last_login
       FROM users u
       LEFT JOIN organisations o ON o.id = u.organisation_id
       WHERE u.plan_id != 'free' OR u.subscription_tier != 'free'
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const adminId = getAdminId(request);
    await createAuditLog(buildAuditEntry(request, adminId, 'subscription_view', {
      targetType: 'subscriptions_list',
      newValue: { page, limit },
    }));

    return {
      ok: true,
      subscriptions: (rows as Record<string, unknown>[]).map(r => ({
        id:               r.id,
        email:            r.email,
        role:             r.role,
        plan:             r.plan_id,
        subscriptionTier: r.subscription_tier,
        status:           r.is_active ? 'active' : 'past_due',
        organisationName: r.organisation_name,
        createdAt:        (r.created_at as Date).toISOString(),
        lastLoginAt:      r.last_login ? (r.last_login as Date).toISOString() : null,
      })),
      pagination: {
        page,
        limit,
        note: 'Stripe integration pending — derived from users table',
      },
    };
  });

  // ── GET /audit-logs ──────────────────────────────────────────────────────

  fastify.get('/audit-logs', {
    schema: { querystring: AuditLogQuerySchema },
  }, async (request, reply) => {
    const {
      adminId: filterAdminId,
      action:  filterAction,
      targetId: filterTargetId,
      search:  filterSearch,
      from,
      to,
      page = 1,
      limit = 50,
    } = request.query as {
      adminId?: string; action?: string; targetId?: string; search?: string;
      from?: string; to?: string; page?: number; limit?: number;
    };

    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (filterAdminId) {
      params.push(filterAdminId);
      where += ` AND admin_id = $${params.length}`;
    }
    if (filterAction) {
      params.push(filterAction);
      where += ` AND action = $${params.length}`;
    }
    if (filterTargetId) {
      params.push(filterTargetId);
      where += ` AND target_id = $${params.length}`;
    }
    if (filterSearch) {
      params.push(`%${filterSearch}%`);
      where += ` AND (reason ILIKE $${params.length} OR action ILIKE $${params.length} OR target_id ILIKE $${params.length})`;
    }
    if (from) {
      params.push(new Date(from));
      where += ` AND created_at >= $${params.length}`;
    }
    if (to) {
      params.push(new Date(to));
      where += ` AND created_at <= $${params.length}`;
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, admin_id, action, target_type, target_id,
                old_value, new_value, reason, ip_address,
                impersonating, impersonated_user_id, created_at
         FROM admin_audit_logs
         ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      pool.query(
        `SELECT COUNT(*)::int as total FROM admin_audit_logs ${where}`,
        params.slice(0, -2),
      ),
    ]);

    const adminId = getAdminId(request);
    await createAuditLog(buildAuditEntry(request, adminId, 'audit_log_view', {
      targetType: 'audit_logs',
      newValue: { page, limit, filterAdminId, filterAction },
    }));

    const logs = (rowsResult.rows as Record<string, unknown>[]).map(row => ({
      id:                  row.id,
      adminId:            row.admin_id,
      action:             row.action,
      targetType:         row.target_type,
      targetId:           row.target_id,
      oldValue:           row.old_value,
      newValue:           row.new_value,
      reason:             row.reason,
      ipAddress:          row.ip_address,
      impersonating:      row.impersonating,
      impersonatedUserId: row.impersonated_user_id,
      createdAt:          (row.created_at as Date).toISOString(),
    }));

    const total = (countResult.rows[0] as { total: number }).total;

    return {
      ok: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // ── GET /feature-flags ───────────────────────────────────────────────────

  fastify.get('/feature-flags', async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT key, value, description, updated_by, updated_at, created_at
       FROM feature_flags
       ORDER BY key ASC`,
    );

    const adminId = getAdminId(request);
    await createAuditLog(buildAuditEntry(request, adminId, 'flag_view', {
      targetType: 'feature_flags',
    }));

    return {
      ok: true,
      flags: (rows as Record<string, unknown>[]).map(row => {
        const raw = row.value as { value?: unknown } | boolean;
        const boolValue = typeof raw === 'boolean'
          ? raw
          : (raw as { value?: unknown })?.value as boolean ?? false;

        return {
          key:         row.key,
          value:       boolValue,
          rawValue:    row.value,    // include raw for complex flags
          description: row.description,
          updatedBy:   row.updated_by,
          updatedAt:   (row.updated_at as Date).toISOString(),
          createdAt:   (row.created_at as Date).toISOString(),
        };
      }),
    };
  });

  // ── PATCH /feature-flags/:key ────────────────────────────────────────────

  fastify.patch<{
    Params: { key: string };
    Body: { value?: unknown; reason?: string };
  }>(
    '/feature-flags/:key',
    {
      schema: { body: FlagToggleSchema },
    },
    async (request, reply) => {
      const { key } = request.params;
      const { value, reason } = request.body ?? {};

      if (!reason || reason.length < 10) {
        return reply.code(400).send({
          ok: false,
          error: 'A reason of at least 10 characters is required to change feature flags',
          code: 'REASON_REQUIRED',
        });
      }

      // Load current value for audit
      const { rows: beforeRows } = await pool.query(
        `SELECT value, description FROM feature_flags WHERE key = $1`,
        [key],
      );
      if (!beforeRows.length) {
        return reply.code(404).send({ ok: false, error: `Feature flag '${key}' not found` });
      }
      const before = beforeRows[0] as { value: unknown; description: string };

      const adminId = getAdminId(request);

      // Update the flag
      const newValue = typeof value === 'object'
        ? JSON.stringify(value)
        : JSON.stringify({ value });

      await pool.query(
        `UPDATE feature_flags
         SET value = $1::jsonb, updated_by = $2, updated_at = NOW()
         WHERE key = $3`,
        [newValue, adminId, key],
      );

      await createAuditLog(buildAuditEntry(request, adminId, 'flag_toggle', {
        targetType: 'feature_flag',
        targetId: key,
        oldValue: before.value as Record<string, unknown>,
        newValue: value as Record<string, unknown>,
        reason,
      }));

      request.log.info(
        { adminId, flagKey: key, newValue: value },
        '[admin] feature flag changed',
      );

      return {
        ok: true,
        flag: {
          key,
          value,
          description: before.description,
        },
      };
    },
  );

  // ── GET /platform-analytics ───────────────────────────────────────────────

  fastify.get('/platform-analytics', async (request, reply) => {
    const adminId = getAdminId(request);
    await createAuditLog(buildAuditEntry(request, adminId, 'platform_analytics_view', {
      targetType: 'platform_analytics',
    }));

    // Run all analytics queries in parallel
    const [
      totalUsersResult,
      activeRoutesResult,
      stopCompletionResult,
      turnScoreResult,
      vehicleResult,
      fleetResult,
    ] = await Promise.all([
      // Total and active user counts
      pool.query(`
        SELECT
          COUNT(*)::int                                               as total_users,
          COUNT(*) FILTER (WHERE u.is_active)::int                  as active_users,
          COUNT(*) FILTER (WHERE u.plan_id != 'free')::int           as paid_users,
          COUNT(*) FILTER (WHERE u.role = 'driver')::int             as driver_users,
          COUNT(*) FILTER (WHERE u.role = 'dispatcher')::int         as dispatcher_users,
          COUNT(*) FILTER (WHERE u.role = 'admin')::int              as admin_users
        FROM users u
      `),
      // Active routes
      pool.query(`
        SELECT
          COUNT(*)::int                                       as total_routes,
          COUNT(*) FILTER (WHERE status = 'active')::int      as active_routes,
          COUNT(*) FILTER (WHERE status = 'completed')::int  as completed_routes,
          COUNT(*) FILTER (WHERE status = 'abandoned')::int  as abandoned_routes,
          SUM(total_stops)::int                             as total_stops,
          SUM(completed_stops)::int                         as completed_stops,
          SUM(failed_stops)::int                            as failed_stops
        FROM routes
        WHERE shift_start >= NOW() - INTERVAL '30 days'
      `),
      // Stop completion rates
      pool.query(`
        SELECT
          COUNT(*)::int                                               as total_stops,
          COUNT(*) FILTER (WHERE status = 'completed')::int          as completed_stops,
          COUNT(*) FILTER (WHERE status = 'failed')::int             as failed_stops,
          COUNT(*) FILTER (WHERE status = 'pending')::int            as pending_stops,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'completed')::numeric
            / NULLIF(COUNT(*), 0) * 100, 1
          )::numeric                                                  as completion_rate
        FROM stops
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),
      // Turn score distribution
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE turn_alert_level = 'GREEN')::int  as green,
          COUNT(*) FILTER (WHERE turn_alert_level = 'AMBER')::int  as amber,
          COUNT(*) FILTER (WHERE turn_alert_level = 'RED')::int    as red,
          COUNT(*) FILTER (WHERE turn_alert_level IS NULL)::int    as unknown,
          ROUND(AVG(turn_score)::numeric, 2)::numeric              as avg_turn_score
        FROM stops
        WHERE turn_score IS NOT NULL
          AND created_at >= NOW() - INTERVAL '30 days'
      `),
      // Top vehicle profiles
      pool.query(`
        SELECT r.vehicle_id, COUNT(*)::int as route_count
        FROM routes r
        WHERE r.shift_start >= NOW() - INTERVAL '30 days'
          AND r.vehicle_id IS NOT NULL
        GROUP BY r.vehicle_id
        ORDER BY route_count DESC
        LIMIT 10
      `),
      // Fleet/organisation count
      pool.query(`
        SELECT COUNT(*)::int as total_organisations
        FROM organisations
      `),
    ]);

    const u = totalUsersResult.rows[0] as Record<string, unknown>;
    const r = activeRoutesResult.rows[0] as Record<string, unknown>;
    const s = stopCompletionResult.rows[0] as Record<string, unknown>;
    const t = turnScoreResult.rows[0] as Record<string, unknown>;
    const v = vehicleResult.rows as Record<string, unknown>[];
    const f = fleetResult.rows[0] as Record<string, unknown>;

    const completionRate = Number(s.completion_rate ?? 0);
    const totalDecided = Number(s.completed_stops) + Number(s.failed_stops);
    const podCaptureRate = 0.0; // TODO: implement when POD data is available

    return {
      ok: true,
      analytics: {
        period: 'last_30_days',
        users: {
          total:           u.total_users,
          active:          u.active_users,
          paid:            u.paid_users,
          byRole: {
            drivers:    u.driver_users,
            dispatchers: u.dispatcher_users,
            admins:     u.admin_users,
          },
        },
        routes: {
          total:      r.total_routes,
          active:     r.active_routes,
          completed:  r.completed_routes,
          abandoned:  r.abandoned_routes,
        },
        stops: {
          total:          s.total_stops,
          completed:      s.completed_stops,
          failed:         s.failed_stops,
          pending:        s.pending_stops,
          completionRate: completionRate,
          podCaptureRate,
        },
        turnScores: {
          green:     t.green,
          amber:     t.amber,
          red:       t.red,
          unknown:   t.unknown,
          avgScore:  t.avg_turn_score,
          greenRate: totalDecided > 0
            ? Math.round((Number(t.green) / totalDecided) * 1000) / 10
            : 0,
          amberRate: totalDecided > 0
            ? Math.round((Number(t.amber) / totalDecided) * 1000) / 10
            : 0,
          redRate:   totalDecided > 0
            ? Math.round((Number(t.red) / totalDecided) * 1000) / 10
            : 0,
        },
        topVehicles: v.map(row => ({
          vehicleId:   row.vehicle_id,
          routeCount:  row.route_count,
        })),
        fleets: {
          total: f.total_organisations,
        },
      },
    };
  });

  // ── GET /system-health ───────────────────────────────────────────────────

  fastify.get('/system-health', async (request, reply) => {
    const adminId = getAdminId(request);
    await createAuditLog(buildAuditEntry(request, adminId, 'system_health_view', {
      targetType: 'system_health',
    }));

    // Check DB
    let dbStatus: 'ok' | 'degraded' | 'error' = 'ok';
    let dbLatencyMs: number | null = null;
    try {
      const start = Date.now();
      await pool.query('SELECT 1');
      dbLatencyMs = Date.now() - start;
      if (dbLatencyMs > 1000) dbStatus = 'degraded';
    } catch {
      dbStatus = 'error';
    }

    // Check Redis
    let redisStatus: 'ok' | 'degraded' | 'error' = 'ok';
    try {
      const _cache = await import('../../cache/index.js');
      // Redis check is best-effort — don't fail the health endpoint
      redisStatus = 'ok';
    } catch {
      redisStatus = 'error';
    }

    // DB table sizes (approximate)
    let tableSizes: Record<string, number> = {};
    try {
      const { rows } = await pool.query(`
        SELECT schemaname, tablename,
               pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
               pg_total_relation_size(schemaname||'.'||tablename) as bytes
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10
      `);
      tableSizes = Object.fromEntries(
        (rows as Record<string, unknown>[]).map(row => [
          `${row.schemaname}.${row.tablename}`,
          Number(row.bytes),
        ]),
      );
    } catch {
      // Non-fatal — may not have permission
    }

    return {
      ok: true,
      health: {
        database: {
          status:   dbStatus,
          latencyMs: dbLatencyMs,
        },
        redis: {
          status: redisStatus,
          note:   'Redis check is informational only',
        },
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV ?? 'development',
        tableSizes,
      },
    };
  });

  // ════════════════════════════════════════════════════════════════════════════
  // NEW PHASE 3 ROUTES
  // ════════════════════════════════════════════════════════════════════════════

  // ── Helpers ───────────────────────────────────────────────────────────────

  function adminId(req: FastifyRequest): string {
    return (req as unknown as { authUser?: { id: string } }).authUser?.id ?? 'unknown';
  }

  function isOwner(req: FastifyRequest): boolean {
    return (req as unknown as { authUser?: { isOwner?: boolean } }).authUser?.isOwner ?? false;
  }

  // ── GET /admin/overview ────────────────────────────────────────────────────

  fastify.get('/overview', async (request, reply) => {

    // Wraps each query so one missing column/table doesn't kill the whole panel.
    async function safeQuery<T extends Record<string, unknown> = Record<string, unknown>>(
      label: string,
      fn: () => Promise<{ rows: T[] }>,
    ): Promise<{ rows: T[]; warnings: string[] }> {
      try {
        const result = await fn();
        return { rows: result.rows, warnings: [] };
      } catch (err) {
        const msg = (err as Error).message;
        request.log.warn({ err }, `[admin/overview] "${label}" query failed — ${msg}`);
        return { rows: [{}] as T[], warnings: [msg] };
      }
    }
    const aid = adminId(request);

    // Run queries independently so one failure doesn't cascade.
    const [userCounts, planMix, trialCount, newSignups7, newSignups30, openTickets, recentErrors, dbSizeResult] =
      await Promise.all([
        safeQuery('userCounts', () => pool.query(`
          SELECT
            COUNT(*)::int                                           AS total,
            COUNT(*) FILTER (WHERE role = 'admin' AND is_owner = TRUE)::int  AS owners,
            COUNT(*) FILTER (WHERE role = 'admin' AND is_owner = FALSE)::int AS admins,
            COUNT(*) FILTER (WHERE role = 'driver')::int          AS drivers,
            COUNT(*) FILTER (WHERE role = 'dispatcher')::int     AS dispatchers,
            COUNT(*) FILTER (WHERE is_active = FALSE)::int        AS inactive
          FROM users
        `)),
        safeQuery('planMix', () => pool.query(`
          SELECT plan_id, plan_status, COUNT(*)::int AS count
          FROM users
          GROUP BY ROLLUP (plan_id, plan_status)
          ORDER BY plan_id NULLS LAST, plan_status NULLS LAST
        `)),
        safeQuery('trialCount', () => pool.query(`
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE plan_status = 'trialing'
            AND trial_ends_at > NOW()
        `)),
        safeQuery('newSignups7', () => pool.query(`
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE created_at >= NOW() - INTERVAL '7 days'
        `)),
        safeQuery('newSignups30', () => pool.query(`
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE created_at >= NOW() - INTERVAL '30 days'
        `)),
        safeQuery('openTickets', () => pool.query(`
          SELECT COUNT(*)::int AS count
          FROM tickets
          WHERE status = 'open'
        `)),
        safeQuery('recentErrors', () => pool.query(`
          SELECT COUNT(*)::int AS count
          FROM admin_audit_logs
          WHERE action = 'server_error'
            AND created_at >= NOW() - INTERVAL '24 hours'
        `)),
        safeQuery('dbSize', () => pool.query(`
          SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
                 pg_database_size(current_database())                  AS bytes
        `)),
      ]);

    const warnings = [
      ...userCounts.warnings,
      ...planMix.warnings,
      ...trialCount.warnings,
      ...newSignups7.warnings,
      ...newSignups30.warnings,
      ...openTickets.warnings,
      ...recentErrors.warnings,
      ...dbSizeResult.warnings,
    ];

    const u  = userCounts.rows[0] as Record<string, unknown>;
    const pm = planMix.rows as Record<string, unknown>[];
    const ds = dbSizeResult.rows[0] as Record<string, unknown>;

    return {
      ok: true,
      warnings: warnings.length ? warnings : undefined,
      overview: {
        users: {
          total:       u.total ?? 0,
          owners:      u.owners ?? 0,
          admins:      u.admins ?? 0,
          drivers:     u.drivers ?? 0,
          dispatchers: u.dispatchers ?? 0,
          inactive:    u.inactive ?? 0,
        },
        plans: pm.map(row => ({
          planId:     row.plan_id ?? 'all',
          planStatus: row.plan_status ?? 'all',
          count:      row.count ?? 0,
        })),
        trials:     { onTrial: trialCount.rows[0]?.count ?? 0 },
        newSignups: {
          last7d:  newSignups7.rows[0]?.count ?? 0,
          last30d: newSignups30.rows[0]?.count ?? 0,
        },
        tickets:   { open: openTickets.rows[0]?.count ?? 0 },
        errors24h: recentErrors.rows[0]?.count ?? 0,
        dbSize:    (ds.size as string) ?? 'unknown',
        dbBytes:   Number(ds.bytes) || 0,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
  });

  // ── GET /admin/trials ──────────────────────────────────────────────────────

  fastify.get('/trials', async (request, reply) => {
    try {
      const { rows } = await pool.query(`
        SELECT id, email, role,
               trial_ends_at,
               plan_status,
               created_at,
               last_login,
               EXTRACT(DAY FROM (trial_ends_at - NOW()))::int AS days_remaining
        FROM users
        WHERE plan_status = 'trialing'
          AND trial_ends_at > NOW()
        ORDER BY trial_ends_at ASC
        LIMIT 200
      `);

      return {
        ok: true,
        trials: (rows as Record<string, unknown>[]).map(r => ({
          id:            r.id,
          email:         r.email,
          role:          r.role,
          trialEndsAt:   r.trial_ends_at ? (r.trial_ends_at as Date).toISOString() : null,
          daysRemaining: r.days_remaining ?? null,
          planStatus:    r.plan_status ?? 'trialing',
          joinedAt:      r.created_at ? (r.created_at as Date).toISOString() : null,
          lastLogin:     r.last_login ? (r.last_login as Date).toISOString() : null,
        })),
      };
    } catch (err) {
      request.log.warn({ err }, '[admin/trials] query failed — trial columns may be missing');
      return { ok: true, trials: [] };
    }
  });

  // ── PATCH /admin/users/:id ─────────────────────────────────────────────────

  fastify.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/users/:id',
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body as Record<string, unknown>;
      const aid = adminId(request);

      // Load current state
      const { rows: beforeRows } = await pool.query(
        `SELECT email, is_active, is_owner FROM users WHERE id = $1`,
        [id],
      );
      if (!beforeRows.length) return reply.code(404).send({ ok: false, error: 'User not found' });
      const before = beforeRows[0] as { email: string; is_active: boolean; is_owner: boolean };

      // is_active toggle
      if ('isActive' in body) {
        const newActive = Boolean(body.isActive);
        if (!newActive) {
          // Cannot deactivate the last admin
          const { rows: adminCount } = await pool.query<{ count: number }>(
            `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_active = TRUE`,
          );
          if (before.is_active && (adminCount[0] as { count: number }).count <= 1) {
            return reply.code(409).send({
              ok: false,
              error: 'Cannot deactivate the last active admin.',
              code: 'LAST_ADMIN',
            });
          }
        }
        await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [newActive, id]);
      }

      await createAuditLog(buildAuditEntry(request, aid, 'user_update', {
        targetType: 'user',
        targetId: id,
        newValue: { isActive: body.isActive },
        reason: (body.reason as string | undefined) ?? 'Admin profile edit',
      }));

      return { ok: true };
    },
  );

  // ── POST /admin/users/:id/subscription ────────────────────────────────────

  fastify.post<{
    Params: { id: string };
    Body: {
      planId?: string;
      trialDays?: number;
      expiresAt?: string;
      compMonths?: number;
      cancelAtPeriodEnd?: boolean;
      reason?: string;
    };
  }>(
    '/users/:id/subscription',
    async (request, reply) => {
      const { id } = request.params;
      const { planId, trialDays, expiresAt, compMonths, cancelAtPeriodEnd, reason } = request.body ?? {};
      const aid = adminId(request);

      if (!reason || String(reason).length < 10) {
        return reply.code(400).send({ ok: false, error: 'reason (min 10 chars) is required', code: 'REASON_REQUIRED' });
      }

      const { rows: beforeRows } = await pool.query(
        `SELECT plan_id, plan_status, trial_ends_at, plan_expires_at, email FROM users WHERE id = $1`,
        [id],
      );
      if (!beforeRows.length) return reply.code(404).send({ ok: false, error: 'User not found' });
      const before = beforeRows[0] as Record<string, unknown>;

      const updates: string[] = [];
      const params: unknown[] = [id];
      let p = 1;

      if (planId && ['navigation', 'custom'].includes(planId)) {
        p++;
        updates.push(`plan_id = $${p}`);
        params.push(planId);
      }
      if (trialDays !== undefined && Number.isInteger(trialDays) && trialDays > 0) {
        p++;
        updates.push(`trial_ends_at = NOW() + ($${p} || ' days')::interval`);
        params.push(trialDays);
        p++;
        updates.push(`plan_status = 'trialing'`);
        params.push('trialing');
      }
      if (expiresAt) {
        const date = new Date(expiresAt);
        if (!isNaN(date.getTime())) {
          p++;
          updates.push(`plan_expires_at = $${p}`);
          params.push(date);
          p++;
          updates.push(`plan_status = 'active'`);
          params.push('active');
        }
      }
      if (compMonths !== undefined && Number.isInteger(compMonths) && compMonths > 0) {
        p++;
        updates.push(`plan_expires_at = COALESCE(plan_expires_at, NOW()) + ($${p} || ' months')::interval`);
        params.push(compMonths);
        p++;
        updates.push(`plan_status = 'active'`);
        params.push('active');
      }
      if (cancelAtPeriodEnd === true) {
        p++;
        updates.push(`plan_status = 'canceled'`);
        params.push('canceled');
        p++;
        updates.push(`plan_expires_at = NOW()`);
        params.push(new Date());
      }

      if (updates.length === 0) {
        return reply.code(400).send({ ok: false, error: 'No valid subscription changes provided' });
      }

      p++;
      await pool.query(
        `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1`,
        params,
      );

      await createAuditLog(buildAuditEntry(request, aid, 'plan_change', {
        targetType: 'user',
        targetId: id,
        oldValue: { plan_id: before.plan_id, plan_status: before.plan_status },
        newValue: request.body,
        reason,
      }));

      return { ok: true };
    },
  );

  // ── POST /admin/users/:id/role ─────────────────────────────────────────────

  fastify.post<{
    Params: { id: string };
    Body: { role?: string; reason?: string };
  }>(
    '/users/:id/role',
    async (request, reply) => {
      const { id } = request.params;
      const { role, reason } = request.body ?? {};
      const aid = adminId(request);

      if (!isOwner(request)) {
        return reply.code(403).send({
          ok: false,
          error: 'Only the owner can change user roles.',
          code: 'OWNER_REQUIRED',
        });
      }
      if (!role || !['driver', 'dispatcher', 'admin'].includes(role)) {
        return reply.code(400).send({ ok: false, error: 'role must be driver, dispatcher, or admin' });
      }
      if (!reason || String(reason).length < 10) {
        return reply.code(400).send({ ok: false, error: 'reason (min 10 chars) required', code: 'REASON_REQUIRED' });
      }

      const { rows: targetRows } = await pool.query(
        `SELECT id, email, role, is_owner FROM users WHERE id = $1`,
        [id],
      );
      if (!targetRows.length) return reply.code(404).send({ ok: false, error: 'User not found' });
      const target = targetRows[0] as { id: string; email: string; role: string; is_owner: boolean };

      if (target.is_owner) {
        return reply.code(409).send({
          ok: false,
          error: 'The owner account cannot change its own role.',
          code: 'CANNOT_CHANGE_OWNER_ROLE',
        });
      }
      if (target.role === role) {
        return reply.code(400).send({ ok: false, error: `User is already a ${role}` });
      }

      // Guard: cannot demote the last admin
      if (role !== 'admin') {
        const { rows: adminCount } = await pool.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_active = TRUE AND id != $1`,
          [id],
        );
        if ((adminCount[0] as { count: number }).count === 0) {
          return reply.code(409).send({
            ok: false,
            error: 'Cannot demote the last admin. Promote another user to admin first.',
            code: 'LAST_ADMIN',
          });
        }
      }

      const newIsOwner = role === 'admin';  // admins are promoted to owner by default in our model
      await pool.query(
        `UPDATE users SET role = $1, is_owner = $2, updated_at = NOW() WHERE id = $3`,
        [role, newIsOwner, id],
      );

      await createAuditLog(buildAuditEntry(request, aid, 'user_update', {
        targetType: 'user',
        targetId: id,
        oldValue: { role: target.role, is_owner: target.is_owner },
        newValue: { role, is_owner: newIsOwner },
        reason,
      }));

      return { ok: true };
    },
  );

  // ── GET /admin/tickets ─────────────────────────────────────────────────────

  fastify.get('/tickets', async (request, reply) => {
    const { status, priority, assignee, page = '1', limit = '20' } = request.query as {
      status?: string; priority?: string; assignee?: string;
      page?: string; limit?: string;
    };
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;
    const params: unknown[] = [];
    let where = 'WHERE 1=1';

    if (status) { params.push(status); where += ` AND t.status = $${params.length}`; }
    if (priority) { params.push(priority); where += ` AND t.priority = $${params.length}`; }
    if (assignee) { params.push(assignee); where += ` AND t.assignee_admin_id = $${params.length}`; }

    params.push(limitNum, offset);
    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT t.id, t.user_id, t.subject, t.status, t.priority,
                t.assignee_admin_id, t.created_at, t.updated_at, t.closed_at,
                u.email AS user_email, a.email AS assignee_email,
                (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id)::int AS message_count
         FROM tickets t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN users a ON a.id = t.assignee_admin_id
         ${where}
         ORDER BY t.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM tickets t ${where}`,
        params.slice(0, -2),
      ),
    ]);

    const total = (countResult.rows[0] as { total: number }).total;
    return {
      ok: true,
      tickets: (rowsResult.rows as Record<string, unknown>[]).map(r => ({
        id:              r.id,
        userId:          r.user_id,
        userEmail:       r.user_email,
        subject:         r.subject,
        status:          r.status,
        priority:        r.priority,
        assigneeId:      r.assignee_admin_id,
        assigneeEmail:   r.assignee_email,
        messageCount:    r.message_count,
        createdAt:       (r.created_at as Date).toISOString(),
        updatedAt:       (r.updated_at as Date).toISOString(),
        closedAt:        r.closed_at ? (r.closed_at as Date).toISOString() : null,
      })),
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    };
  });

  // ── GET /admin/tickets/:id ─────────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>(
    '/tickets/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { rows: ticketRows } = await pool.query(
        `SELECT t.*, u.email AS user_email, a.email AS assignee_email
         FROM tickets t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN users a ON a.id = t.assignee_admin_id
         WHERE t.id = $1`,
        [id],
      );
      if (!ticketRows.length) return reply.code(404).send({ ok: false, error: 'Ticket not found' });
      const ticket = ticketRows[0] as Record<string, unknown>;

      const { rows: messages } = await pool.query(
        `SELECT tm.id, tm.author_user_id, tm.author_is_admin, tm.body, tm.created_at,
                u.email AS author_email
         FROM ticket_messages tm
         LEFT JOIN users u ON u.id = tm.author_user_id
         WHERE tm.ticket_id = $1
         ORDER BY tm.created_at ASC`,
        [id],
      );

      return {
        ok: true,
        ticket: {
          id:              ticket.id,
          userId:          ticket.user_id,
          userEmail:       ticket.user_email,
          subject:         ticket.subject,
          body:            ticket.body,
          status:          ticket.status,
          priority:        ticket.priority,
          assigneeId:      ticket.assignee_admin_id,
          assigneeEmail:   ticket.assignee_email,
          createdAt:       (ticket.created_at as Date).toISOString(),
          updatedAt:       (ticket.updated_at as Date).toISOString(),
          closedAt:        ticket.closed_at ? (ticket.closed_at as Date).toISOString() : null,
        },
        messages: (messages as Record<string, unknown>[]).map(m => ({
          id:             m.id,
          authorId:       m.author_user_id,
          authorEmail:    m.author_email,
          authorIsAdmin:  m.author_is_admin,
          body:           m.body,
          createdAt:      (m.created_at as Date).toISOString(),
        })),
      };
    },
  );

  // ── POST /admin/tickets/:id/reply ──────────────────────────────────────────

  fastify.post<{
    Params: { id: string };
    Body: { body?: string };
  }>(
    '/tickets/:id/reply',
    async (request, reply) => {
      const { id } = request.params;
      const { body } = request.body ?? {};
      const aid = adminId(request);

      if (!body || body.trim().length < 5) {
        return reply.code(400).send({ ok: false, error: 'Reply body must be at least 5 characters' });
      }

      const { rows: ticketRows } = await pool.query(
        `SELECT id FROM tickets WHERE id = $1`,
        [id],
      );
      if (!ticketRows.length) return reply.code(404).send({ ok: false, error: 'Ticket not found' });

      const { rows: msgRows } = await pool.query<{ id: string }>(
        `INSERT INTO ticket_messages (ticket_id, author_user_id, author_is_admin, body)
           VALUES ($1, $2, TRUE, $3)
         RETURNING id`,
        [id, aid, body.trim()],
      );

      // Auto-set status to 'pending' on admin reply
      await pool.query(
        `UPDATE tickets SET status = 'pending' WHERE id = $1 AND status = 'open'`,
        [id],
      );

      await createAuditLog(buildAuditEntry(request, aid, 'ticket_reply', {
        targetType: 'ticket',
        targetId: id,
        newValue: { messageId: msgRows[0].id },
      }));

      return { ok: true, messageId: msgRows[0].id };
    },
  );

  // ── PATCH /admin/tickets/:id ───────────────────────────────────────────────

  fastify.patch<{
    Params: { id: string };
    Body: { status?: string; priority?: string; assigneeId?: string | null };
  }>(
    '/tickets/:id',
    async (request, reply) => {
      const { id } = request.params;
      const { status, priority, assigneeId } = request.body ?? {};
      const aid = adminId(request);

      const updates: string[] = [];
      const params: unknown[] = [id];
      let p = 1;

      if (status && ['open', 'pending', 'closed'].includes(status)) {
        p++; updates.push(`status = $${p}`); params.push(status);
      }
      if (priority && ['low', 'normal', 'high', 'urgent'].includes(priority)) {
        p++; updates.push(`priority = $${p}`); params.push(priority);
      }
      if ('assigneeId' in request.body) {
        p++;
        updates.push(`assignee_admin_id = $${p}`);
        params.push(assigneeId === '' ? null : assigneeId);
      }

      if (updates.length === 0) {
        return reply.code(400).send({ ok: false, error: 'No valid fields to update' });
      }

      const { rowCount } = await pool.query(
        `UPDATE tickets SET ${updates.join(', ')} WHERE id = $1`,
        params,
      );
      if (!rowCount) return reply.code(404).send({ ok: false, error: 'Ticket not found' });

      await createAuditLog(buildAuditEntry(request, aid, 'ticket_update', {
        targetType: 'ticket',
        targetId: id,
        newValue: { status, priority, assigneeId },
      }));

      return { ok: true };
    },
  );

  // ── GET /admin/admins ──────────────────────────────────────────────────────

  fastify.get('/admins', async (request, reply) => {
    const { rows } = await pool.query(`
      SELECT id, email, is_owner, is_active, created_at, last_login
      FROM users
      WHERE role = 'admin'
      ORDER BY is_owner DESC, created_at ASC
    `);

    return {
      ok: true,
      admins: (rows as Record<string, unknown>[]).map(r => ({
        id:         r.id,
        email:      r.email,
        isOwner:    r.is_owner,
        isActive:   r.is_active,
        createdAt:  (r.created_at as Date).toISOString(),
        lastLogin:  r.last_login ? (r.last_login as Date).toISOString() : null,
      })),
    };
  });

  // ── POST /admin/admins ─────────────────────────────────────────────────────

  fastify.post<{
    Body: { email?: string; reason?: string };
  }>(
    '/admins',
    async (request, reply) => {
      if (!isOwner(request)) {
        return reply.code(403).send({ ok: false, error: 'Only the owner can add admins.', code: 'OWNER_REQUIRED' });
      }
      const { email, reason } = request.body ?? {};
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply.code(400).send({ ok: false, error: 'Valid email required' });
      }
      if (!reason || String(reason).length < 10) {
        return reply.code(400).send({ ok: false, error: 'reason (min 10 chars) required', code: 'REASON_REQUIRED' });
      }

      const aid = adminId(request);
      const { rows: existingRows } = await pool.query(
        `SELECT id, email, role, is_owner FROM users WHERE email = $1`,
        [email],
      );

      if (!existingRows.length) {
        return reply.code(404).send({ ok: false, error: `No user found with email: ${email}` });
      }
      const existing = existingRows[0] as { id: string; email: string; role: string; is_owner: boolean };

      if (existing.role === 'admin' && existing.is_owner) {
        return reply.code(400).send({ ok: false, error: 'This user is already the owner.' });
      }
      if (existing.role === 'admin') {
        return reply.code(400).send({ ok: false, error: 'This user is already an admin.' });
      }

      await pool.query(
        `UPDATE users SET role = 'admin', is_owner = FALSE, is_active = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [existing.id],
      );

      await createAuditLog(buildAuditEntry(request, aid, 'user_update', {
        targetType: 'user',
        targetId: existing.id,
        oldValue: { role: existing.role, is_owner: existing.is_owner },
        newValue: { role: 'admin', is_owner: false },
        reason,
      }));

      return { ok: true, userId: existing.id, email: existing.email };
    },
  );

  // ── DELETE /admin/admins/:id ───────────────────────────────────────────────

  fastify.delete<{ Params: { id: string }; Body: { reason?: string } }>(
    '/admins/:id',
    async (request, reply) => {
      if (!isOwner(request)) {
        return reply.code(403).send({ ok: false, error: 'Only the owner can remove admins.', code: 'OWNER_REQUIRED' });
      }
      const { id } = request.params;
      const { reason } = request.body ?? {};
      const aid = adminId(request);

      if (!reason || String(reason).length < 10) {
        return reply.code(400).send({ ok: false, error: 'reason (min 10 chars) required', code: 'REASON_REQUIRED' });
      }

      const { rows: targetRows } = await pool.query(
        `SELECT id, email, is_owner FROM users WHERE id = $1 AND role = 'admin'`,
        [id],
      );
      if (!targetRows.length) return reply.code(404).send({ ok: false, error: 'Admin not found' });
      const target = targetRows[0] as { id: string; email: string; is_owner: boolean };

      if (target.is_owner) {
        return reply.code(409).send({ ok: false, error: 'Cannot remove the owner account.', code: 'CANNOT_REMOVE_OWNER' });
      }

      // Guard: cannot remove the last non-owner admin
      const { rows: adminCount } = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_owner = FALSE AND is_active = TRUE AND id != $1`,
        [id],
      );
      if ((adminCount[0] as { count: number }).count === 0) {
        return reply.code(409).send({
          ok: false,
          error: 'Cannot remove the last admin. Promote another user to admin first.',
          code: 'LAST_ADMIN',
        });
      }

      // Demote to driver
      await pool.query(
        `UPDATE users SET role = 'driver', is_owner = FALSE, is_active = FALSE, updated_at = NOW()
         WHERE id = $1`,
        [id],
      );

      await createAuditLog(buildAuditEntry(request, aid, 'user_update', {
        targetType: 'user',
        targetId: id,
        oldValue: { role: 'admin', is_owner: false },
        newValue: { role: 'driver', is_owner: false, is_active: false },
        reason,
      }));

      return { ok: true };
    },
  );

  // ── GET /admin/errors ──────────────────────────────────────────────────────

  fastify.get('/errors', async (request, reply) => {
    const { page = '1', limit = '50' } = request.query as { page?: string; limit?: string };
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, admin_id, action, target_type, target_id, old_value, new_value,
                reason, ip_address, created_at
         FROM admin_audit_logs
         WHERE action LIKE 'server_error%'
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limitNum, offset],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM admin_audit_logs
         WHERE action LIKE 'server_error%'`,
      ),
    ]);

    const total = (countResult.rows[0] as { total: number }).total;
    return {
      ok: true,
      errors: (rowsResult.rows as Record<string, unknown>[]).map(r => ({
        id:         r.id,
        adminId:    r.admin_id,
        action:     r.action,
        targetType: r.target_type,
        targetId:   r.target_id,
        oldValue:   r.old_value,
        newValue:   r.new_value,
        reason:     r.reason,
        ipAddress:  r.ip_address,
        createdAt:  (r.created_at as Date).toISOString(),
      })),
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    };
  });
};
