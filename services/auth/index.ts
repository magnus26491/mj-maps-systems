/**
 * Auth Service
 * ------------
 * - Password hashing with bcryptjs (cost 12)
 * - JWT access token (15min expiry)
 * - Opaque refresh token (64-byte random hex, stored as SHA-256 hash)
 * - Server-side token rotation via refresh_tokens table
 *
 * The refresh token is NOT a JWT — it is an opaque 64-byte random value.
 * Only its SHA-256 hash is ever stored in the DB. This means:
 *   - Tokens cannot be decoded/inspected (no info leakage)
 *   - A compromised DB dump cannot be used to forge tokens
 *   - Rotation is simple: revoke old hash, issue new token + hash
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET ?? 'changeme_insecure_default';

// Guard production throw — only fires when functions are actually called, not at import time
function guardProduction(): void {
  if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'changeme_insecure_default') {
    throw new Error('JWT_SECRET must be set in production.');
  }
}

// ── Types ─────────────────────────────────

export type UserRole = 'driver' | 'dispatcher' | 'admin';
export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'enterprise';

/** Decoded JWT payload — returned by verifyAccessToken on success */
export interface AccessPayload {
  sub:  string;  // user UUID
  role: string;
  tier: string;
  planId: string;
  iat: number;
  exp: number;
}

/** Token pair returned by signTokenPair (used by login/refresh) */
export interface TokenPair {
  accessToken:  string;
  refreshToken: string;
  /** SHA-256 hex hash of the raw refresh token — stored in DB, never the raw value */
  refreshTokenHash: string;
  expiresAt:    Date;  // when the refresh token expires
}

// ── Password ─────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) throw new Error('Password must be at least 8 characters');
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── Access Token (JWT, 15 min) ──────────────────────────────

/**
 * Sign a short-lived JWT access token.
 * Payload: { sub, role, tier, planId, iat, exp }
 */
export function signAccessToken(userId: string, role: string, tier: string, planId: string): string {
  guardProduction();
  return jwt.sign(
    { sub: userId, role, tier, planId },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

/**
 * Verify a JWT access token.
 * Returns the decoded payload on success, null on any error (expired, tampered, etc.).
 * Use this for middleware — never let verification errors bubble as 500s.
 */
export function verifyAccessToken(token: string): AccessPayload | null {
  try {
    guardProduction();
    const payload = jwt.verify(token, JWT_SECRET) as AccessPayload;
    if (!payload.sub || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Refresh Token (opaque, 30 days) ──────────────────────────────

/**
 * Generate a new opaque refresh token.
 * 64 random bytes → 128 hex characters.
 * Not a JWT — no claims, no expiry encoded in the token itself.
 * Expiry is stored server-side in the refresh_tokens table.
 */
export function signRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * SHA-256 hash of a raw refresh token.
 * Only this hash is stored in the DB.
 */
export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// ── Convenience: sign both tokens together ─────────────────────────────

export interface SignTokenPairOptions {
  userId: string;
  role: string;
  tier: string;
  planId: string;
  expiresInDays?: number;  // default 30
}

/**
 * Sign an access token + refresh token pair.
 * Returns the raw refreshToken so it can be sent to the client.
 * The client stores the raw token; the server stores only the hash.
 */
export function signTokenPair(opts: SignTokenPairOptions): TokenPair {
  const { userId, role, tier, planId, expiresInDays = 30 } = opts;
  const accessToken  = signAccessToken(userId, role, tier, planId);
  const refreshToken = signRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
  return { accessToken, refreshToken, refreshTokenHash, expiresAt };
}
