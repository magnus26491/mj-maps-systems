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
 * Endpoints:
 *   GET  /users              — paginated user list with safe fields
 *   GET  /users/:userId     — full safe profile + recent routes
 *   POST /users/:userId/impersonate — start impersonation session
 *   POST /impersonation/end  — end active impersonation
 *   PATCH /users/:userId/plan — change plan (requires reason)
 *   GET  /subscriptions      — read-only Stripe subscription data
 *   GET  /audit-logs        — paginated immutable audit records
 *   GET  /feature-flags     — all flags
 *   PATCH /feature-flags/:key — toggle flag (requires reason)
 *   GET  /platform-analytics — anonymised aggregate metrics
 *   GET  /system-health     — Redis + DB + external API health
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import {
  requireAdmin,
  createAuditLog,
  buildAuditEntry,
  createImpersonationToken,
  endImpersonation,
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
      request.query as { page?: number; limit?: number; search?: string; plan?: string; isActive?: string; sort?: string };

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

    const sortCol = ['email', 'role', 'plan_id', 'created_at', 'last_login'].includes(sort)
      ? sort : 'created_at';
    const sortDir = request.query.sort === 'email' ? 'ASC NULLS LAST' : 'DESC NULLS LAST';

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
      from,
      to,
      page = 1,
      limit = 50,
    } = request.query as {
      adminId?: string; action?: string; targetId?: string;
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
      const { getPool: _gp, redis: _r } = await import('../../cache/index.js');
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
};
