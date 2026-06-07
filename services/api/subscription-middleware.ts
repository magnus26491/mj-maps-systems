/**
 * Subscription middleware — enforces plan gates at the API layer
 *
 * Applied to:
 *   POST /api/v1/shifts/:shiftId/stops  — stop count gate
 *   POST /api/v1/drivers                — driver count gate
 *   GET  /api/v1/routes/:shiftId        — offline feature gate
 *
 * The check is always server-side. Client-side gates (useFeatureGate hook)
 * are UX hints only — this is the enforcement layer.
 */

import type { Request, Response, NextFunction } from 'express';
import { canAddStop, hasFeature, canAddDriver, type PlanId } from '../../packages/subscription-engine/index.js';

// In production this comes from the JWT claim or a Redis plan cache
async function getPlanForOrg(orgId: string): Promise<PlanId> {
  // TODO: query Postgres users table
  // SELECT subscription_tier FROM users WHERE organisation_id = $1 LIMIT 1
  return 'pro'; // placeholder
}

export async function enforceStopLimit(
  req: Request & { orgId?: string; planId?: PlanId },
  res: Response,
  next: NextFunction
) {
  const orgId = req.orgId ?? req.body?.orgId;
  const currentCount = parseInt(req.body?.currentStopCount ?? '0', 10);

  const planId = req.planId ?? await getPlanForOrg(orgId);
  const gate = canAddStop(planId, currentCount);

  if (!gate.allowed) {
    return res.status(402).json({
      error: 'STOP_LIMIT_REACHED',
      message: gate.reason,
      upgradeHint: gate.upgradeHint,
    });
  }

  req.planId = planId;
  next();
}

export async function enforceFeature(
  feature: Parameters<typeof hasFeature>[1]
) {
  return async (
    req: Request & { orgId?: string; planId?: PlanId },
    res: Response,
    next: NextFunction
  ) => {
    const orgId = req.orgId ?? req.body?.orgId;
    const planId = req.planId ?? await getPlanForOrg(orgId);
    const gate = hasFeature(planId, feature);

    if (!gate.allowed) {
      return res.status(402).json({
        error: 'FEATURE_NOT_AVAILABLE',
        message: gate.reason,
        upgradeHint: gate.upgradeHint,
      });
    }

    req.planId = planId;
    next();
  };
}

export async function enforceDriverLimit(
  req: Request & { orgId?: string; planId?: PlanId },
  res: Response,
  next: NextFunction
) {
  const orgId = req.orgId ?? req.body?.orgId;
  const currentCount = parseInt(req.body?.currentDriverCount ?? '0', 10);

  const planId = req.planId ?? await getPlanForOrg(orgId);
  const gate = canAddDriver(planId, currentCount);

  if (!gate.allowed) {
    return res.status(402).json({
      error: 'DRIVER_LIMIT_REACHED',
      message: gate.reason,
      upgradeHint: gate.upgradeHint,
    });
  }

  next();
}
