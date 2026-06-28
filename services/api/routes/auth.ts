/**
 * Auth Routes — Fastify Plugin
 * Mounted on /api/v1/auth
 *
 * Endpoints:
 *   POST /register   — create a new user account
 *   POST /login      — issue access + refresh token pair
 *   POST /refresh    — rotate refresh token (revoke old, issue new)
 *   POST /logout     — revoke a refresh token
 *   GET  /me         — return current user profile (auth required)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { pool } from '../../db/index';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  hashRefreshToken,
  signTokenPair,
  verifyAccessToken,
  // UserRole intentionally not imported — role is always 'driver' in registration
} from '../../auth/index';
import { requireAuth } from '../middleware/auth.js';
import { createAuditLog } from '../middleware/admin.js';

// ── Request body schemas ─────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * SECURITY FIX (Phase 1.1): Public registration ALWAYS creates role='driver'.
 * Any role in the body is silently ignored. Role elevation requires authenticated
 * admin API calls only (POST /api/v1/admin/admins).
 *
 * Regression test: POST /register with role:'admin' must return role='driver'.
 */
const RegisterSchema = {
  type: 'object',
  properties: {
    email:           { type: 'string' },
    password:        { type: 'string' },
    organisation_id: { type: 'string' },
    // role is accepted in body but SILENTLY IGNORED — never written to DB
  },
  required: ['email', 'password'],
  // Explicitly forbid role field to prevent accidental inclusion
  additionalProperties: false,
};

const LoginSchema = {
  type: 'object',
  properties: {
    email:    { type: 'string' },
    password: { type: 'string' },
  },
  required: ['email', 'password'],
};

const RefreshSchema = {
  type: 'object',
  properties: {
    refreshToken: { type: 'string' },
  },
  required: ['refreshToken'],
};

const LogoutSchema = {
  type: 'object',
  properties: {
    refreshToken: { type: 'string' },
  },
  required: ['refreshToken'],
};

// ── Zod validation schemas (password reset) ────────────────────────────────────

const ForgotPasswordSchema = z.object({
  email: z.string().email().max(254),
});

const ResetPasswordSchema = z.object({
  token:       z.string().length(64).regex(/^[a-f0-9]+$/),
  newPassword: z.string().min(8).max(128),
});

// ── Email (Resend) ─────────────────────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const FROM_EMAIL     = 'noreply@mjmapsystems.com';

/**
 * Send a plain-text password-reset email via Resend.
 * Fire-and-forget — callers .catch() this.
 */
async function sendResetEmail(opts: { to: string; subject: string; body: string }): Promise<void> {
  if (!RESEND_API_KEY) {
    // Fall back to console in dev — production must have RESEND_API_KEY set
    console.warn(`[auth] RESEND_API_KEY not set — would send email to ${opts.to}: ${opts.subject}`);
    return;
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [opts.to],
      subject: opts.subject,
      text:    opts.body,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend API error ${resp.status}: ${text}`);
  }
}

// ── Plugin ─────────────────────────────────────────────────────────────────────

export const authRoutes: FastifyPluginAsync = async (fastify) => {

  // ── POST /register ─────────────────────────────────────────────────────────
  fastify.post<{
    Body: {
      email?: string;
      password?: string;
      role?: string;
      organisation_id?: string;
    };
  }>(
    '/register',
    {
      schema: { body: RegisterSchema },
    },
    async (request, reply) => {
      // role is explicitly excluded — public registration always creates a driver
      const { email, password, organisation_id } = request.body ?? {};

      // Validate email format
      if (!email || !EMAIL_RE.test(email)) {
        return reply.code(400).send({ error: 'Invalid email format' });
      }

      // Validate password length
      if (!password || password.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters' });
      }

      // ── ALWAYS driver — no role from body is ever used ──────────────────────
      const FORCED_ROLE = 'driver' as const;

      let passwordHash: string;
      try {
        passwordHash = await hashPassword(password);
      } catch {
        return reply.code(400).send({ error: 'Password must be at least 8 characters' });
      }

      try {
        const { rows } = await pool.query(
          `INSERT INTO users (email, password_hash, role, organisation_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, role, subscription_tier as tier`,
          [email, passwordHash, FORCED_ROLE, organisation_id ?? null],
        );

        const user = rows[0] as { id: string; email: string; role: string; tier: string };
        return reply.code(201).send({
          userId: user.id,
          email:  user.email,
          role:   user.role,  // always 'driver'
          tier:   user.tier,
        });
      } catch (err: unknown) {
        const message = (err as { code?: string }).code === '23505'
          ? 'Email already exists'
          : 'Registration failed';
        return reply.code(message === 'Email already exists' ? 409 : 500).send({ error: message });
      }
    },
  );

  // ── POST /login ─────────────────────────────────────────────────────────────
  fastify.post<{
    Body: { email?: string; password?: string };
  }>(
    '/login',
    {
      schema: { body: LoginSchema },
    },
    async (request, reply) => {
      const { email, password } = request.body ?? {};

      if (!email || !password) {
        return reply.code(400).send({ error: 'Email and password are required' });
      }

      const { rows } = await pool.query(
        `SELECT id, email, password_hash, role, subscription_tier as tier,
                COALESCE(plan_id, 'navigation') as plan_id, is_active, is_owner
         FROM users WHERE email = $1`,
        [email],
      );

      if (!rows.length) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const user = rows[0] as {
        id: string;
        email: string;
        password_hash: string;
        role: string;
        tier: string;
        plan_id: string;
        is_active: boolean;
        is_owner: boolean;
      };

      if (!user.is_active) {
        return reply.code(403).send({ error: 'Account is inactive' });
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Update last_login
      await pool.query(
        `UPDATE users SET last_login = NOW() WHERE id = $1`,
        [user.id],
      );

      // Issue tokens
      const tokens = signTokenPair({
        userId:  user.id,
        role:    user.role,
        tier:    user.tier,
        planId:  user.plan_id ?? 'navigation',
        isOwner: user.is_owner ?? false,
      });

      // Store hashed refresh token in DB
      await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokens.refreshTokenHash, tokens.expiresAt],
      );

      return reply.send({
        accessToken:  tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id:      user.id,
          email:   user.email,
          role:    user.role,
          tier:    user.tier,
          planId:  user.plan_id ?? 'navigation',
          isOwner: user.is_owner ?? false,
        },
      });
    },
  );

  // ── POST /refresh ───────────────────────────────────────────────────────────
  // Atomic token rotation: revoke old + issue new pair
  fastify.post<{
    Body: { refreshToken?: string };
  }>(
    '/refresh',
    {
      schema: { body: RefreshSchema },
    },
    async (request, reply) => {
      const rawToken = request.body?.refreshToken;
      if (!rawToken) {
        return reply.code(400).send({ error: 'refreshToken is required' });
      }

      const tokenHash = hashRefreshToken(rawToken);

      // Find the token in DB — must be valid (not revoked, not expired)
      const { rows } = await pool.query(
        `SELECT user_id
         FROM refresh_tokens
         WHERE token_hash = $1
           AND revoked    = FALSE
           AND expires_at  > NOW()
         LIMIT 1`,
        [tokenHash],
      );

      if (!rows.length) {
        return reply.code(401).send({ error: 'Invalid or expired refresh token' });
      }

      const { user_id: userId } = rows[0] as { user_id: string };

      // Load user to get current role/tier/planId/isOwner
      const { rows: userRows } = await pool.query(
        `SELECT id, role, subscription_tier as tier, COALESCE(plan_id, 'navigation') as plan_id, is_owner
         FROM users WHERE id = $1 AND is_active = TRUE`,
        [userId],
      );

      if (!userRows.length) {
        return reply.code(401).send({ error: 'User not found or inactive' });
      }

      const user = userRows[0] as { id: string; role: string; tier: string; plan_id: string; is_owner: boolean };

      // ── Atomic rotation: revoke old + insert new in transaction ───────────
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Revoke old token
        await client.query(
          `UPDATE refresh_tokens
           SET revoked = TRUE
           WHERE token_hash = $1`,
          [tokenHash],
        );

        // Issue new token pair
        const newTokens = signTokenPair({
          userId:  user.id,
          role:    user.role,
          tier:    user.tier,
          planId:  user.plan_id,
          isOwner: user.is_owner ?? false,
        });

        // Store new hashed refresh token
        await client.query(
          `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3)`,
          [user.id, newTokens.refreshTokenHash, newTokens.expiresAt],
        );

        await client.query('COMMIT');

        return reply.send({
          accessToken:  newTokens.accessToken,
          refreshToken: newTokens.refreshToken,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  );

  // ── POST /logout ─────────────────────────────────────────────────────────────
  fastify.post<{
    Body: { refreshToken?: string };
  }>(
    '/logout',
    {
      schema: { body: LogoutSchema },
    },
    async (request, reply) => {
      const rawToken = request.body?.refreshToken;
      if (!rawToken) {
        return reply.code(400).send({ error: 'refreshToken is required' });
      }

      const tokenHash = hashRefreshToken(rawToken);
      await pool.query(
        `UPDATE refresh_tokens
         SET revoked = TRUE
         WHERE token_hash = $1`,
        [tokenHash],
      );

      return reply.code(204).send();
    },
  );

  // ── GET /me ──────────────────────────────────────────────────────────────────
  fastify.get(
    '/me',
    {
      onRequest: [requireAuth],
    },
    async (request, reply) => {
      const payload = verifyAccessToken(
        (request.headers.authorization ?? '').slice(7),
      );
      if (!payload) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const { rows } = await pool.query(
        `SELECT id, email, role, subscription_tier as tier,
                COALESCE(plan_id, 'navigation') as plan_id,
                organisation_id, is_owner,
                vehicle_id, vehicle_make, vehicle_model, vehicle_year,
                vehicle_height_m, vehicle_gvw_kg, vehicle_payload_kg, vehicle_length_m,
                created_at, last_login, is_active
         FROM users WHERE id = $1`,
        [payload.sub],
      );

      if (!rows.length) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const user = rows[0] as {
        id: string;
        email: string;
        role: string;
        tier: string;
        plan_id: string;
        organisation_id: string | null;
        is_owner: boolean;
        vehicle_id: string;
        vehicle_make: string | null;
        vehicle_model: string | null;
        vehicle_year: number | null;
        vehicle_height_m: number | null;
        vehicle_gvw_kg: number | null;
        vehicle_payload_kg: number | null;
        vehicle_length_m: number | null;
        created_at: Date;
        last_login: Date | null;
        is_active: boolean;
      };

      return reply.send({
        id:              user.id,
        email:           user.email,
        role:            user.role,
        tier:            user.tier,
        planId:          user.plan_id,
        isOwner:         user.is_owner ?? false,
        organisationId:  user.organisation_id,
        createdAt:       user.created_at,
        lastLogin:       user.last_login,
        isActive:        user.is_active,
        vehicleId:       user.vehicle_id,
        vehicleMake:     user.vehicle_make    ?? null,
        vehicleModel:    user.vehicle_model   ?? null,
        vehicleYear:     user.vehicle_year    ?? null,
        vehicleHeightM:  user.vehicle_height_m  ?? null,
        vehicleGvwKg:    user.vehicle_gvw_kg   ?? null,
        vehiclePayloadKg:user.vehicle_payload_kg ?? null,
        vehicleLengthM:  user.vehicle_length_m  ?? null,
      });
    },
  );

  // ── DELETE /account ─────────────────────────────────────────────────────────
  // Apple App Store mandate: in-app account deletion must be available.
  // Delivery audit records are anonymised (driver_id → NULL) rather than deleted
  // to satisfy 7-year UK Companies Act 2006 record retention requirements.
  fastify.delete(
    '/account',
    {
      onRequest: [requireAuth],
    },
    async (request, reply) => {
      const authUser = (request as unknown as { authUser?: { id: string } }).authUser;
      if (!authUser) {
        return reply.code(401).send({ message: 'Unauthorized' });
      }
      const userId = authUser.id;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Anonymise failed delivery audit records (legal retention — 7 years)
        await client.query(
          `UPDATE failed_delivery_audit SET driver_id = NULL WHERE driver_id = $1`,
          [userId],
        );

        // Anonymise POD upload audit records
        // Migration 011 drops NOT NULL from uploaded_by_user_id so this is safe
        await client.query(
          `UPDATE pod_uploads SET uploaded_by_user_id = NULL WHERE uploaded_by_user_id = $1`,
          [userId],
        );

        // Revoke all refresh tokens
        await client.query(
          `DELETE FROM refresh_tokens WHERE user_id = $1`,
          [userId],
        );

        // Delete the user
        await client.query(
          `DELETE FROM users WHERE id = $1`,
          [userId],
        );

        await client.query('COMMIT');
        return reply.code(200).send({ message: 'Account deleted successfully.' });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => { /* swallow */ });
        fastify.log.error(err);
        return reply.code(500).send({ message: 'Failed to delete account.' });
      } finally {
        client.release();
      }
    },
  );

  // ── POST /forgot-password ─────────────────────────────────────────────────
// Rate limit: 3 per IP+email per 15 minutes (enforced at server level)
// Always returns 200 — never reveals whether email exists.
fastify.post('/forgot-password', {
  config: {
    rateLimit: {
      max:       3,
      timeWindow: '15 minutes',
      keyGenerator: (req: any) => {
        const body = req.body as { email?: string };
        return `${req.ip}:${body?.email ?? 'unknown'}`;
      },
    },
  },
}, async (req, reply) => {
  const body = req.body as { email?: string };
  const rawEmail = (body?.email ?? '').trim().toLowerCase();

  // Validate email format — return generic 200 for bad format too
  const parsed = ForgotPasswordSchema.safeParse({ email: rawEmail });
  if (!parsed.success) {
    return reply.code(200).send({ ok: true });
  }
  const email = parsed.data.email;

  // Look up the user by email
  const { rows } = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [email],
  );

  if (rows.length === 0) {
    // Always return 200 — prevents email enumeration
    return reply.code(200).send({ ok: true });
  }

  const user = rows[0];

  // Generate a cryptographically secure 64-char hex token
  const rawToken   = crypto.randomBytes(32).toString('hex');
  const tokenHash  = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt  = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  const clientIp   = (req.headers['x-forwarded-for'] as string | undefined)
    ?? req.ip ?? null;
  const userAgent  = (req.headers['user-agent'] ?? null)?.substring(0, 500) ?? null;

  // Invalidate all previous unused tokens for this user
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [user.id],
  );

  // Store only the hash — raw token never touches the DB
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, tokenHash, expiresAt, clientIp, userAgent],
  );

  // Send rawToken to the user via email — this is the only time it exists in plaintext
  const resetUrl = `https://mjmapsystems.com/reset-password?token=${rawToken}`;
  const emailBody = [
    `Click this link to reset your MJ Maps password (valid 1 hour):`,
    ``,
    `${resetUrl}`,
    ``,
    `If you did not request this, you can safely ignore this email.`,
    `Your password will not change unless you click the link above.`,
  ].join('\n');

  sendResetEmail({
    to:      user.email,
    subject: 'Reset your MJ Maps password',
    body:    emailBody,
  }).catch(err => {
    fastify.log.error({ err, email: user.email }, '[auth] forgot-password email failed');
  });

  return reply.code(200).send({ ok: true });
});


// ── POST /reset-password ───────────────────────────────────────────────────
// Consumes the token and sets the new password atomically.
// Always returns TOKEN_INVALID for any failure — never reveals why.
// Rate limit: 5 per IP per 15 minutes (brute-force protection on token guess).
fastify.post('/reset-password', {
  config: {
    rateLimit: {
      max:       5,
      timeWindow: '15 minutes',
      keyGenerator: (req: any) => req.ip,
    },
  },
}, async (req, reply) => {
  const body = req.body as { token?: string; newPassword?: string };
  const { token, newPassword } = body ?? {};

  // Validate input shape with Zod
  const parsed = ResetPasswordSchema.safeParse({ token, newPassword });
  if (!parsed.success) {
    return reply.code(400).send({
      ok:   false,
      error: 'This reset link is invalid or has expired. Please request a new one.',
      code: 'TOKEN_INVALID',
    });
  }

  const { token: rawToken, newPassword: newPwd } = parsed.data;

  // Hash the incoming token and look it up
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const { rows } = await pool.query<{
    id:        number;
    user_id:   string;
    expires_at: Date;
    used_at:   Date | null;
  }>(
    `SELECT id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token_hash = $1`,
    [tokenHash],
  );

  // Constant-time-style rejection — don't reveal WHY it failed
  if (
    !rows.length ||
    rows[0].used_at !== null ||
    new Date(rows[0].expires_at) < new Date()
  ) {
    return reply.code(400).send({
      ok:   false,
      error: 'This reset link is invalid or has expired. Please request a new one.',
      code: 'TOKEN_INVALID',
    });
  }

  const { id: tokenId, user_id: userId } = rows[0];

  // Hash the new password
  const newHash = await hashPassword(newPwd);

  // Atomic transaction: mark token used + update password + invalidate other tokens
  await pool.query('BEGIN');
  try {
    // Mark this token as used
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
      [tokenId],
    );

    // Invalidate any other pending tokens for this user
    await pool.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1 AND id != $2 AND used_at IS NULL`,
      [userId, tokenId],
    );

    // Set the new password
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, userId],
    );

    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }

  // Audit log — runs after commit so we don't block the response
  createAuditLog({
    admin_id:            userId,
    action:              'password_reset',
    target_type:         'user',
    target_id:           userId,
    old_value:           null,
    new_value:           { method: 'email_token' },
    reason:              null,
    ip_address:          (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip ?? null,
    user_agent:          (req.headers['user-agent'] ?? null)?.substring(0, 500) ?? null,
    impersonating:       false,
    impersonated_user_id: null,
  }).catch(err => {
    fastify.log.error({ err, userId }, '[auth] password_reset audit log failed');
  });

  return reply.send({ ok: true });
});
};


// ── VIP Invite Redemption ─────────────────────────────────────────────────────
// Public routes (no auth) registered separately at /invite prefix in server.ts.
// These functions are exported so server.ts can register them at the correct path.

const RegisterVipSchema = z.object({
  token:       z.string().length(64).regex(/^[a-f0-9]+$/),
  name:        z.string().min(1).max(200),
  newPassword: z.string().min(8).max(128),
});

export const inviteRoutes: FastifyPluginAsync = async (fastify) => {

  // ── GET /invite/accept?token=<rawToken> ─────────────────────────────────────
  // Redirects to the app with the right outcome:
  //   - Existing user → upgrades to vip, redirects to app with JWT
  //   - New user      → redirects to /register?invite=<rawToken>
  fastify.get<{ Querystring: { token?: string } }>(
    '/accept',
    async (request, reply) => {
      const rawToken = (request.query as { token?: string }).token ?? '';

      if (!rawToken || !/^[a-f0-9]{64}$/.test(rawToken)) {
        return reply.redirect(302, 'https://mjmapsystems.com/invite-invalid');
      }

      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const { rows } = await pool.query<{
        id:         number;
        email:      string;
        status:     string;
        invited_by: string;
        user_id:    string | null;
      }>(
        `SELECT id, email, status, invited_by, user_id
         FROM vip_invites
         WHERE token_hash = $1`,
        [tokenHash],
      );

      if (!rows.length || rows[0].status !== 'pending') {
        return reply.redirect(302, 'https://mjmapsystems.com/invite-invalid');
      }

      const invite = rows[0];

      // Check if user with this email already exists
      const { rows: existingUsers } = await pool.query<{
        id: string; email: string; role: string; subscription_tier: string;
      }>(
        `SELECT id, email, role, subscription_tier FROM users WHERE email = $1`,
        [invite.email],
      );

      if (existingUsers.length > 0) {
        // Upgrade existing user to vip
        const existingUser = existingUsers[0];

        await pool.query(
          `UPDATE users
           SET plan_status = 'vip', subscription_tier = 'pro'
           WHERE id = $1`,
          [existingUser.id],
        );

        await pool.query(
          `UPDATE vip_invites
           SET status = 'accepted', accepted_at = NOW(), user_id = $1
           WHERE id = $2`,
          [existingUser.id, invite.id],
        );

        // Re-fetch to get updated plan_id and is_owner
        const { rows: updatedUser } = await pool.query<{
          id: string; role: string; subscription_tier: string;
          plan_id: string; is_owner: boolean;
        }>(
          `SELECT id, role, subscription_tier,
                  COALESCE(plan_id, 'navigation') as plan_id,
                  COALESCE(is_owner, false) as is_owner
           FROM users WHERE id = $1`,
          [existingUser.id],
        );
        const u = updatedUser[0];

        const tokens = signTokenPair({
          userId:  u.id,
          role:    u.role,
          tier:    u.subscription_tier,
          planId:  u.plan_id,
          isOwner: u.is_owner,
        });

        return reply.redirect(
          302,
          `https://mjmapsystems.com/vip-welcome#token=${tokens.accessToken}&refresh=${tokens.refreshToken}`,
        );
      }

      // New user — redirect to registration with invite token pre-filled
      return reply.redirect(
        302,
        `https://mjmapsystems.com/register?invite=${rawToken}`,
      );
    },
  );


  // ── POST /register-vip ───────────────────────────────────────────────────────
  // Creates a new account from a VIP invite link. No auth required.
  fastify.post<{ Body: { token?: string; name?: string; password?: string } }>(
    '/register-vip',
    async (request, reply) => {
      const body = request.body ?? {};
      const parsed = RegisterVipSchema.safeParse(body);
      if (!parsed.success) {
        return reply.code(400).send({
          ok:   false,
          error: 'Invalid input: token must be 64 hex chars, name required, password 8–128 chars.',
          code: 'INVALID_INPUT',
        });
      }

      const { token: rawToken, name: _name, newPassword: password } = parsed.data;
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // Look up pending invite
      const { rows: inviteRows } = await pool.query<{
        id:         number;
        email:      string;
        status:     string;
        invited_by: string;
      }>(
        `SELECT id, email, status, invited_by
         FROM vip_invites
         WHERE token_hash = $1`,
        [tokenHash],
      );

      if (!inviteRows.length || inviteRows[0].status !== 'pending') {
        return reply.code(400).send({
          ok:   false,
          error: 'This invite link is invalid or has already been used. Please request a new invite.',
          code: 'INVITE_INVALID',
        });
      }
      const invite = inviteRows[0];

      // Check if email already registered (race condition guard)
      const { rows: existingRows } = await pool.query(
        `SELECT id FROM users WHERE email = $1`,
        [invite.email],
      );
      if (existingRows.length > 0) {
        return reply.code(409).send({
          ok:   false,
          error: 'An account with this email already exists. Please log in and use the invite link to upgrade.',
          code: 'EMAIL_EXISTS',
        });
      }

      // Hash password and create user
      const passwordHash = await hashPassword(password);

      await pool.query('BEGIN');
      try {
        const { rows: newUserRows } = await pool.query<{
          id: string; email: string; role: string; subscription_tier: string;
        }>(
          `INSERT INTO users (email, password_hash, role, subscription_tier, plan_status)
           VALUES ($1, $2, 'driver', 'pro', 'vip')
           RETURNING id, email, role, subscription_tier`,
          [invite.email, passwordHash],
        );
        const newUser = newUserRows[0];

        await pool.query(
          `UPDATE vip_invites
           SET status = 'accepted', accepted_at = NOW(), user_id = $1
           WHERE id = $2`,
          [newUser.id, invite.id],
        );

        await pool.query('COMMIT');

        // Issue JWT pair
        const tokens = signTokenPair({
          userId:  newUser.id,
          role:    newUser.role,
          tier:    newUser.subscription_tier,
          planId:  'navigation',
          isOwner: false,
        });

        return reply.send({
          ok:          true,
          accessToken:  tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: {
            id:    newUser.id,
            email: newUser.email,
            role:  newUser.role,
            tier:  newUser.subscription_tier,
          },
        });
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    },
  );
};
