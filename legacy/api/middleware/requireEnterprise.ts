/**
 * requireEnterprise middleware
 * ----------------------------
 * Must be used AFTER authenticateDriver (uses req.driver.planId).
 * Guards routes that require an Enterprise plan.
 *
 * Usage:
 *   router.post('/some-route', authenticateDriver, requireRole('dispatcher'), requireEnterprise, handler);
 */

import { Request, Response, NextFunction } from 'express';

export function requireEnterprise(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.driver) {
    res.status(401).json({ success: false, error: 'Not authenticated.' });
    return;
  }
  if (req.driver.planId !== 'enterprise') {
    res.status(403).json({
      success: false,
      error: 'Enterprise plan required.',
      code: 'ENTERPRISE_REQUIRED',
    });
    return;
  }
  next();
}