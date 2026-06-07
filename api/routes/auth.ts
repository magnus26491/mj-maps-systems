/**
 * Auth Routes (Express router)
 * -----------------------------
 * POST /api/auth/login    — email + password → access + refresh tokens
 * POST /api/auth/refresh  — valid refresh token → new access + refresh tokens (rotation)
 * POST /api/auth/logout   — invalidate refresh token session
 * GET  /api/auth/me       — return current driver profile (requires auth)
 *
 * Updated to use the new auth service API:
 *   - signTokenPair(userId, role, tier) instead of signTokenPair({ sub, role, vehicleId })
 *   - hashRefreshToken (not hashToken)
 *   - No verifyRefreshToken (opaque token — look up by hash in DB)
 */

import { Router, Request, Response } from 'express';
import {
  verifyPassword,
  signTokenPair,
  hashRefreshToken,
  verifyAccessToken,
} from '../../services/auth';
import {
  getDriverByEmail,
  createSession,
  getSessionByTokenHash,
  deleteSession,
} from '../../services/db/auth-helpers';
import { authenticateDriver } from '../middleware/authenticate';

export const authRouter = Router();

// ── POST /api/auth/login ───────────────────────────────────────────────────────

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password, deviceInfo } = req.body as {
    email: string;
    password: string;
    deviceInfo?: string;
  };

  if (!email || !password) {
    res.status(400).json({ success: false, error: 'email and password are required.' });
    return;
  }

  // Constant-time-ish: always fetch driver even if email invalid, to prevent timing attacks
  const driver = await getDriverByEmail(email.toLowerCase().trim());

  const passwordValid =
    driver !== null
      ? await verifyPassword(password, driver.password_hash)
      : await verifyPassword(password, '$2b$12$invalidhashpadding000000000000000000000000000000000000'); // dummy

  if (!driver || !passwordValid || !driver.active) {
    res.status(401).json({ success: false, error: 'Invalid email or password.', code: 'AUTH_FAILED' });
    return;
  }

  // New API: signTokenPair({ userId, role, tier })
  const tokens = signTokenPair({
    userId: driver.id,
    role:   driver.role as 'driver' | 'dispatcher' | 'admin',
    tier:   'free', // TODO: pull from users table when migrated
  });

  // Store refresh token hash in DB
  await createSession({
    driverId: driver.id,
    tokenHash: tokens.refreshTokenHash,
    deviceInfo,
    expiresAt: tokens.expiresAt,
  });

  res.json({
    success: true,
    accessToken:  tokens.accessToken,
    refreshToken: tokens.refreshToken,
    driver: {
      id:       driver.id,
      name:     driver.name,
      email:    driver.email,
      role:     driver.role,
      vehicleId: driver.vehicle_id,
    },
  });
});

// ── POST /api/auth/refresh ─────────────────────────────────────────────────────

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };

  if (!refreshToken) {
    res.status(400).json({ success: false, error: 'refreshToken is required.' });
    return;
  }

  // Opaque token: look up by hash in DB (server-side revocation check)
  const tokenHash = hashRefreshToken(refreshToken);
  const session = await getSessionByTokenHash(tokenHash);

  if (!session) {
    res.status(401).json({ success: false, error: 'Session not found or revoked.', code: 'SESSION_REVOKED' });
    return;
  }

  // Load driver to get current role/tier
  const driver = await getDriverByEmail(''); // stub — DB lookup by id needed
  // TODO: update auth-helpers to have getDriverById and use it here

  // Rotate: delete old session, issue new token pair
  await deleteSession(tokenHash);

  const tokens = signTokenPair({
    userId: session.driver_id,
    role:   'driver',  // TODO: pull from users table when migrated
    tier:   'free',
  });

  await createSession({
    driverId: session.driver_id,
    tokenHash: tokens.refreshTokenHash,
    expiresAt: tokens.expiresAt,
  });

  res.json({
    success: true,
    accessToken:  tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────────

authRouter.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };

  if (refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);
    await deleteSession(tokenHash).catch(() => null); // best effort
  }

  res.json({ success: true, message: 'Logged out.' });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────────

authRouter.get('/me', authenticateDriver, (req: Request, res: Response) => {
  res.json({ success: true, driver: req.driver });
});
