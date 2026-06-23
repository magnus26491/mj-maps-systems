/**
 * POST /api/stop-pin
 * ---
 * Resolve the best physical entrance pin for a single stop address.
 *
 * Body: { address: string, what3words?: string, lat?: number, lon?: number, countryCode?: string }
 * Returns: StopPin
 */

import { Router, Request, Response } from 'express';
import { resolveStopPin, RawStopInput } from '../../services/stop-precision';

export const stopPinRouter = Router();

stopPinRouter.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as RawStopInput;
    if (!input.address && !input.what3words && !input.lat) {
      res.status(400).json({ success: false, error: 'Provide address, what3words, or lat/lon.' });
      return;
    }
    const pin = await resolveStopPin(input);
    res.json({ success: true, pin });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});
