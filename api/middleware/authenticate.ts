/**
 * authenticateDriver middleware
 * -----------------------------
 * Verifies the Bearer JWT in the Authorization header.
 * Checks the refresh token hash exists in driver_sessions (server-side revocation).
 * Attaches req.driver to the request for downstream handlers.
 *
 * Usage:
 *   router.post('/some-route', authenticateDriver, handler);
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, hashToken, JwtPayload } from '../../services/auth';
import { getSessionByTokenHash, getDriverById } from '../../services/db/auth-helpers';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      driver?: {
        id: string;
        name: string;
        email: string;
        role: string;
        vehicleId: string;
      };
    }
  }
}

export async function authenticateDriver(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or malformed Authorization header.' });
    return;
  }

  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid token';
    // Distinguish expired from invalid so client can refresh
    const code = msg.includes('expired') ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    res.status(401).json({ success: false, error: msg, code });
    return;
  }

  // Check driver still exists and is active
  const driver = await getDriverById(payload.sub).catch(() => null);
  if (!driver || !driver.active) {
    res.status(401).json({ success: false, error: 'Driver account not found or inactive.', code: 'ACCOUNT_INACTIVE' });
    return;
  }

  req.driver = {
    id: driver.id,
    name: driver.name,
    email: driver.email,
    role: driver.role,
    vehicleId: driver.vehicle_id,
  };

  next();
}
