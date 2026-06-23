/**
 * MJ Maps Systems — Access Resolver
 *
 * Stores and retrieves property access intelligence:
 *  - Gate codes for gated communities
 *  - Intercom unit numbers
 *  - Building access methods (code / intercom / concierge / open)
 *  - Access notes ("ring flat 2 for key", "use rear entrance")
 *  - Community-reported access status (working / broken / unknown)
 *
 * Data is stored in Redis with a 30-day TTL per property.
 * Community reports increment a confidence score.
 *
 * Used by: stop-intelligence.ts
 */

import type { MJMapsCache } from '../cache/redis-cache';

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type AccessMethod =
  | 'INTERCOM'    // Ring intercom unit
  | 'CODE'        // Enter numeric/alpha gate/door code
  | 'CONCIERGE'   // Hand to concierge/reception
  | 'OPEN'        // No barrier — walk straight in
  | 'CALLBOX'     // Call customer from external callbox
  | 'APP'         // Building has a delivery app (e.g. Paxton, ButterflyMX)
  | 'UNKNOWN';

export type AccessStatus = 'WORKING' | 'BROKEN' | 'UNKNOWN';

export interface PropertyAccess {
  /** Normalised property identifier: "postcode:unitNumber" e.g. "SW1A1AA:14" */
  propertyId: string;
  /** Primary access method */
  accessMethod: AccessMethod;
  /** Gate / door entry code */
  gateCode: string | null;
  /** Intercom unit number to buzz */
  intercomUnit: string | null;
  /** Free-text access instructions */
  accessNotes: string | null;
  /** Current reported status of the access system */
  accessStatus: AccessStatus;
  /** Number of drivers who have confirmed this access data */
  confidenceScore: number;
  /** ISO timestamp of last confirmation */
  lastConfirmedAt: string | null;
  /** ISO timestamp of last reported failure */
  lastFailedAt: string | null;
  /** Whether customer has been warned their code is missing */
  codeMissingFlagged: boolean;
}

export interface AccessReport {
  propertyId: string;
  driverId: string;
  outcome: 'SUCCESS' | 'FAILED' | 'CODE_MISSING' | 'NOT_ANSWERED' | 'CONCIERGE_TOOK';
  notes?: string;
  updatedCode?: string;
  updatedIntercom?: string;
  reportedAt: string;
}

// ─── CACHE KEY HELPERS ───────────────────────────────────────────────────────

const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

function accessKey(propertyId: string): string {
  return `access:${propertyId.toUpperCase().replace(/\s/g, '')}`;
}

// ─── PROPERTY ID ─────────────────────────────────────────────────────────────

/**
 * Build a normalised property ID from postcode + unit.
 * e.g. buildPropertyId('SW1A 1AA', 'Flat 14') → 'SW1A1AA:FLAT14'
 */
export function buildPropertyId(postcode: string, unit?: string): string {
  const pc   = postcode.toUpperCase().replace(/\s/g, '');
  const unit_ = unit ? `:${unit.toUpperCase().replace(/\s/g, '')}` : '';
  return `${pc}${unit_}`;
}

// ─── RESOLVER CLASS ──────────────────────────────────────────────────────────

export class AccessResolver {
  constructor(private cache: MJMapsCache) {}

  /**
   * Get stored access data for a property.
   * Returns null if no data exists yet.
   */
  async getAccess(propertyId: string): Promise<PropertyAccess | null> {
    const key = accessKey(propertyId);
    const raw = await (this.cache as any).client?.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PropertyAccess;
    } catch {
      return null;
    }
  }

  /**
   * Store or update access data for a property.
   * Merges with existing data — does not overwrite fields that aren't provided.
   */
  async setAccess(
    propertyId: string,
    update: Partial<Omit<PropertyAccess, 'propertyId' | 'confidenceScore' | 'lastConfirmedAt'>>,
  ): Promise<PropertyAccess> {
    const existing = await this.getAccess(propertyId);
    const now = new Date().toISOString();

    const merged: PropertyAccess = {
      propertyId,
      accessMethod:       update.accessMethod       ?? existing?.accessMethod       ?? 'UNKNOWN',
      gateCode:           update.gateCode           ?? existing?.gateCode           ?? null,
      intercomUnit:       update.intercomUnit       ?? existing?.intercomUnit       ?? null,
      accessNotes:        update.accessNotes        ?? existing?.accessNotes        ?? null,
      accessStatus:       update.accessStatus       ?? existing?.accessStatus       ?? 'UNKNOWN',
      confidenceScore:    (existing?.confidenceScore ?? 0) + 1,
      lastConfirmedAt:    now,
      lastFailedAt:       existing?.lastFailedAt    ?? null,
      codeMissingFlagged: update.codeMissingFlagged ?? existing?.codeMissingFlagged ?? false,
    };

    const key = accessKey(propertyId);
    await (this.cache as any).client?.setex(key, TTL_SECONDS, JSON.stringify(merged));
    return merged;
  }

  /**
   * Process a driver access report after a delivery attempt.
   * Updates confidence score and failure timestamps accordingly.
   */
  async processReport(report: AccessReport): Promise<PropertyAccess> {
    const existing = await this.getAccess(report.propertyId);
    const now = new Date().toISOString();

    const update: Partial<PropertyAccess> = {};

    switch (report.outcome) {
      case 'SUCCESS':
        update.accessStatus    = 'WORKING';
        update.lastConfirmedAt = now;
        if (report.updatedCode)     update.gateCode     = report.updatedCode;
        if (report.updatedIntercom) update.intercomUnit = report.updatedIntercom;
        break;

      case 'FAILED':
      case 'NOT_ANSWERED':
        update.accessStatus = 'BROKEN';
        update.lastFailedAt = now;
        break;

      case 'CODE_MISSING':
        update.codeMissingFlagged = true;
        update.accessStatus       = 'UNKNOWN';
        break;

      case 'CONCIERGE_TOOK':
        update.accessMethod  = 'CONCIERGE';
        update.accessStatus  = 'WORKING';
        update.accessNotes   = report.notes ?? 'Hand to concierge/reception';
        break;
    }

    return this.setAccess(report.propertyId, update);
  }

  /**
   * Build the access advisory string shown on the driver stop card.
   * Returns null if no access data is available.
   */
  buildAdvisory(access: PropertyAccess | null): string | null {
    if (!access) return null;

    const statusWarning = access.accessStatus === 'BROKEN'
      ? ' ⚠️ Recently reported as not working.'
      : access.accessStatus === 'UNKNOWN' && access.confidenceScore < 2
      ? ' (unverified)'
      : '';

    switch (access.accessMethod) {
      case 'CODE':
        return access.gateCode
          ? `Gate code: ${access.gateCode}${statusWarning}`
          : `Code entry required — code not on file.${statusWarning} Tap to notify customer.`;

      case 'INTERCOM':
        return access.intercomUnit
          ? `Buzz intercom unit ${access.intercomUnit}${statusWarning}`
          : `Intercom entry — unit number not on file.${statusWarning}`;

      case 'CONCIERGE':
        return `Hand to concierge/reception${access.accessNotes ? ` — ${access.accessNotes}` : ''}${statusWarning}`;

      case 'OPEN':
        return 'No barrier — direct access.';

      case 'CALLBOX':
        return `Callbox at entrance${access.accessNotes ? ` — ${access.accessNotes}` : ''}${statusWarning}`;

      case 'APP':
        return `Building app access${access.accessNotes ? ` — ${access.accessNotes}` : ''}${statusWarning}`;

      default:
        return access.accessNotes ?? null;
    }
  }
}
