/**
 * GET /api/v1/paf/lookup?postcode={pc}
 * ---
 * Returns all PAF delivery points for a UK postcode.
 * Protected by authenticateDriver middleware.
 * Rate-limited: 30 lookups per minute per driverId/IP.
 */

import { Router, Request, Response } from 'express';
import { lookupPostcode } from '../services/paf/postcodeClient';

// In-memory rate limit map
const rateLimitMap = new Map<string, number[]>();

export const pafRouter = Router();

pafRouter.get('/lookup', async (req: Request, res: Response) => {
  // Rate limiting
  const driverId = (req as any).user?.id ?? req.ip;
  const now      = Date.now();
  const windowMs = 60_000;
  const maxReq   = 30;
  const timestamps = (rateLimitMap.get(driverId) ?? []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxReq) {
    return res.status(429).send({ error: 'Rate limit exceeded. Max 30 lookups per minute.' });
  }
  timestamps.push(now);
  rateLimitMap.set(driverId, timestamps);

  // Postcode normalisation
  const raw = (req.query as any).postcode ?? '';
  const pc  = raw.toUpperCase().replace(/\s+/g, '');
  const UK_PC = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/;
  if (!UK_PC.test(pc)) {
    return res.status(400).send({ error: 'Invalid UK postcode format' });
  }
  const formatted = pc.replace(UK_PC, '$1 $2');  // 'SW1A2AA' → 'SW1A 2AA'

  try {
    const addresses = await lookupPostcode(formatted);
    return res.json({ postcode: formatted, addresses });
  } catch {
    return res.status(502).send({ error: 'PAF lookup unavailable' });
  }
});