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
import { pool } from '../../db/index';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  hashRefreshToken,
  signTokenPair,
  verifyAccessToken,
  type UserRole,
} from '../../auth/index';

// ── Request body schemas ─────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RegisterSchema = {
  type: 'object',
  properties: {
    email:            { type: 'string' },
    password:         { type: 'string' },
    role:             { type: 'string' },
    organisation_id:  { type: 'string' },
  },
  required: ['email', 'password'],
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
      const { email, password, role = 'driver', organisation_id } = request.body ?? {};

      // Validate email format
      if (!email || !EMAIL_RE.test(email)) {
        return reply.code(400).send({ error: 'Invalid email format' });
      }

      // Validate password length
      if (!password || password.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters' });
      }

      // Validate role
      const validRoles: UserRole[] = ['driver', 'dispatcher', 'admin'];
      if (role && !validRoles.includes(role as UserRole)) {
        return reply.code(400).send({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      }

      let passwordHash: string;
      try {
        passwordHash = await hashPassword(password);
      } catch (err) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters' });
      }

      try {
        const { rows } = await pool.query(
          `INSERT INTO users (email, password_hash, role, organisation_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, role, subscription_tier as tier`,
          [email, passwordHash, role ?? 'driver', organisation_id ?? null],
        );

        const user = rows[0] as { id: string; email: string; role: string; tier: string };
        return reply.code(201).send({
          userId: user.id,
          email:  user.email,
          role:   user.role,
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
        `SELECT id, email, password_hash, role, subscription_tier as tier, is_active
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
        is_active: boolean;
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
        userId: user.id,
        role:   user.role,
        tier:   user.tier,
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
          id:   user.id,
          email: user.email,
          role:  user.role,
          tier:  user.tier,
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

      // Load user to get current role/tier
      const { rows: userRows } = await pool.query(
        `SELECT id, role, subscription_tier as tier
         FROM users WHERE id = $1 AND is_active = TRUE`,
        [userId],
      );

      if (!userRows.length) {
        return reply.code(401).send({ error: 'User not found or inactive' });
      }

      const user = userRows[0] as { id: string; role: string; tier: string };

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
          userId: user.id,
          role:   user.role,
          tier:   user.tier,
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
      onRequest: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      const payload = verifyAccessToken(
        (request.headers.authorization ?? '').slice(7),
      );
      if (!payload) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const { rows } = await pool.query(
        `SELECT id, email, role, subscription_tier as tier, organisation_id,
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
        organisation_id: string | null;
        created_at: Date;
        last_login: Date | null;
        is_active: boolean;
      };

      return reply.send({
        id:              user.id,
        email:           user.email,
        role:            user.role,
        tier:            user.tier,
        organisationId:  user.organisation_id,
        createdAt:       user.created_at,
        lastLogin:       user.last_login,
        isActive:        user.is_active,
      });
    },
  );
};
