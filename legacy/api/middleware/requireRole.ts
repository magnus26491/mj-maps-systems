/**
 * requireRole middleware
 * ----------------------
 * Must be used AFTER authenticateDriver.
 * Guards routes that only dispatchers or admins can access.
 *
 * Usage:
 *   router.get('/fleet', authenticateDriver, requireRole('dispatcher'), handler);
 */

import { Request, Response, NextFunction } from 'express';
import { type UserRole } from '../../services/auth';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  driver: 1,
  dispatcher: 2,
  admin: 3,
};

export function requireRole(minimumRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const driverRole = req.driver?.role as UserRole | undefined;

    if (!driverRole) {
      res.status(401).json({ success: false, error: 'Not authenticated.' });
      return;
    }

    if ((ROLE_HIERARCHY[driverRole] ?? 0) < ROLE_HIERARCHY[minimumRole]) {
      res.status(403).json({
        success: false,
        error: `Requires ${minimumRole} role or above. Your role: ${driverRole}.`,
        code: 'INSUFFICIENT_ROLE',
      });
      return;
    }

    next();
  };
}
