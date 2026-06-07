/**
 * Auth Service
 * ------------
 * - Password hashing with bcrypt (cost 12)
 * - JWT access token (15min) + refresh token (7d)
 * - Token hash stored in driver_sessions for server-side revocation
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET ?? 'changeme_insecure_default';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
const REFRESH_EXPIRES_IN = '7d';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'changeme_insecure_default') {
  throw new Error('JWT_SECRET must be set in production.');
}

// ── Types ────────────────────────────────────────────────────────────────────

export type DriverRole = 'driver' | 'dispatcher' | 'admin';

export interface JwtPayload {
  sub: string;        // driver UUID
  email: string;
  role: DriverRole;
  vehicleId: string;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** SHA-256 hash of refreshToken — stored in driver_sessions */
  refreshTokenHash: string;
  expiresAt: Date;    // refresh token expiry
}

// ── Password ──────────────────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── Tokens ───────────────────────────────────────────────────────────────────

export function signTokenPair(payload: Omit<JwtPayload, 'type'>): TokenPair {
  const accessToken = jwt.sign(
    { ...payload, type: 'access' } satisfies JwtPayload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );

  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' } satisfies JwtPayload,
    JWT_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN },
  );

  const refreshTokenHash = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  // Expiry date for DB storage
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  return { accessToken, refreshToken, refreshTokenHash, expiresAt };
}

export function verifyAccessToken(token: string): JwtPayload {
  const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
  if (payload.type !== 'access') throw new Error('Not an access token.');
  return payload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
  if (payload.type !== 'refresh') throw new Error('Not a refresh token.');
  return payload;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
