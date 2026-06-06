/**
 * Unit tests for driver-api.ts handlers.
 * Uses mock req/res objects — no real HTTP server.
 */

import { handleHealth } from '../driver-api';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('handleHealth', () => {
  it('returns status ok', () => {
    const req = {} as any;
    const res = mockRes();
    handleHealth(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', service: 'mj-maps-systems' })
    );
  });

  it('includes a timestamp', () => {
    const req = {} as any;
    const res = mockRes();
    handleHealth(req, res);
    const arg = (res.json as jest.Mock).mock.calls[0][0];
    expect(typeof arg.timestamp).toBe('string');
  });
});
