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
import { DriverRole } from '../../services/auth';

const ROLE_HIERARCHY: Record<DriverRole, number> = {
  driver: 1,
  dispatcher: 2,
  admin: 3,
};

export function requireRole(minimumRole: DriverRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const driverRole = req.driver?.role as DriverRole | undefined;

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
