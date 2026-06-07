/**
 * Auth Middleware — Fastify onRequest hooks
 *
 * Attaches req.authUser = { id, role, tier } after verifying the JWT.
 * Middleware factories (requireRole, requireTier) return Fastify onRequest hooks.
 *
 * We use req.authUser (not req.user) to avoid conflicts with @fastify/jwt's
 * req.user type (string | object | Buffer). Import and use in route definitions as:
 *   { preHandler: [requireAuth, requireRole('dispatcher', 'admin')] }
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../auth/index';
import { planHasFeature, type FeatureKey } from '../../billing/subscription-guard.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  id:     string;
  role:   string;
  tier:   string;
  planId: string;
}

// ── requireAuth ────────────────────────────────────────────────────────────────

/**
 * Verifies the Authorization: Bearer <token> header.
 * On success: attaches req.authUser and continues.
 * On failure: sends 401 { error: 'Unauthorized' }.
 */
export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);

  if (!payload) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }

  // Attach as req.authUser to avoid conflict with @fastify/jwt's req.user
  (request as unknown as { authUser: AuthUser }).authUser = {
    id:     payload.sub,
    role:   payload.role,
    tier:   payload.tier,
    planId: payload.planId ?? 'navigation',
  };
}

// ── requireFeature() ───────────────────────────────────────────────────────────

/**
 * Returns a Fastify onRequest hook that checks the user's plan has the feature.
 * Must be used after requireAuth.
 */
export function requireFeature(feature: FeatureKey) {
  return function featureGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const authUser = (request as unknown as { authUser?: AuthUser }).authUser;
    if (!authUser) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    const planId = authUser.planId as 'navigation' | 'custom';
    if (!planHasFeature(planId, feature)) {
      reply.code(403).send({
        ok: false,
        error: 'This feature requires the Custom plan.',
        upgradeUrl: 'https://app.mjmaps.co.uk/upgrade',
        feature,
        currentPlan: planId,
      });
      return;
    }
  };
}

// ── requireRole() ───────────────────────────────────────────────────────────────

/**
 * Returns a Fastify onRequest hook that checks req.authUser.role is in roles.
 * Must be used after requireAuth.
 */
export function requireRole(...roles: string[]) {
  return function roleGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const authUser = (request as unknown as { authUser?: AuthUser }).authUser;
    if (!authUser) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    if (!roles.includes(authUser.role)) {
      reply.code(403).send({ error: 'Forbidden' });
      return;
    }
  };
}

// ── requireTier() ───────────────────────────────────────────────────────────────

/**
 * Returns a Fastify onRequest hook that checks req.authUser.tier is in tiers.
 * Must be used after requireAuth.
 * Use for feature gates tied to subscription tier.
 */
export function requireTier(...tiers: string[]) {
  return function tierGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    const authUser = (request as unknown as { authUser?: AuthUser }).authUser;
    if (!authUser) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    if (!tiers.includes(authUser.tier)) {
      reply.code(403).send({ error: 'Plan upgrade required' });
      return;
    }
  };
}
