/**
 * Auth Routes
 * -----------
 * POST /api/auth/login    — email + password → access + refresh tokens
 * POST /api/auth/refresh  — valid refresh token → new access + refresh tokens (rotation)
 * POST /api/auth/logout   — invalidate refresh token session
 * GET  /api/auth/me       — return current driver profile (requires auth)
 */

import { Router, Request, Response } from 'express';
import {
  verifyPassword,
  signTokenPair,
  verifyRefreshToken,
  hashToken,
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

  const tokens = signTokenPair({
    sub: driver.id,
    email: driver.email,
    role: driver.role as 'driver' | 'dispatcher' | 'admin',
    vehicleId: driver.vehicle_id,
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
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    driver: {
      id: driver.id,
      name: driver.name,
      email: driver.email,
      role: driver.role,
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

  // Verify JWT signature first
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired refresh token.', code: 'REFRESH_INVALID' });
    return;
  }

  // Check session exists in DB (server-side revocation check)
  const tokenHash = hashToken(refreshToken);
  const session = await getSessionByTokenHash(tokenHash);
  if (!session) {
    res.status(401).json({ success: false, error: 'Session not found or revoked.', code: 'SESSION_REVOKED' });
    return;
  }

  // Rotate: delete old session, issue new token pair
  await deleteSession(tokenHash);

  const tokens = signTokenPair({
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
    vehicleId: payload.vehicleId,
  });

  await createSession({
    driverId: payload.sub,
    tokenHash: tokens.refreshTokenHash,
    expiresAt: tokens.expiresAt,
  });

  res.json({
    success: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────────

authRouter.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken: string };

  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await deleteSession(tokenHash).catch(() => null); // best effort
  }

  res.json({ success: true, message: 'Logged out.' });
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────────

authRouter.get('/me', authenticateDriver, (req: Request, res: Response) => {
  res.json({ success: true, driver: req.driver });
});
