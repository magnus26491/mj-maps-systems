import { AccessResolver, buildPropertyId } from '../access-resolver';
import type { MJMapsCache } from '../../cache/redis-cache';

// In-memory mock of the Redis-backed cache
function makeMockCache(): MJMapsCache {
  const store = new Map<string, string>();
  return {
    ping: async () => true,
    client: {
      get:    async (k: string) => store.get(k) ?? null,
      setex:  async (k: string, _ttl: number, v: string) => { store.set(k, v); return 'OK'; },
    },
  } as unknown as MJMapsCache;
}

describe('buildPropertyId', () => {
  it('normalises postcode and unit', () => {
    expect(buildPropertyId('SW1A 1AA', 'Flat 14')).toBe('SW1A1AA:FLAT14');
  });

  it('handles postcode only', () => {
    expect(buildPropertyId('EC1A 1BB')).toBe('EC1A1BB');
  });

  it('strips spaces from postcode', () => {
    expect(buildPropertyId('  M1  1AA  ')).toBe('M11AA');
  });
});

describe('AccessResolver', () => {
  let resolver: AccessResolver;

  beforeEach(() => {
    resolver = new AccessResolver(makeMockCache());
  });

  it('returns null for unknown property', async () => {
    const result = await resolver.getAccess('XX1 1XX');
    expect(result).toBeNull();
  });

  it('stores and retrieves access data', async () => {
    await resolver.setAccess('SW1A1AA:FLAT14', {
      accessMethod: 'CODE',
      gateCode: '1234',
      accessStatus: 'WORKING',
    });
    const result = await resolver.getAccess('SW1A1AA:FLAT14');
    expect(result).not.toBeNull();
    expect(result!.gateCode).toBe('1234');
    expect(result!.accessMethod).toBe('CODE');
  });

  it('increments confidence score on each set', async () => {
    await resolver.setAccess('SW1A1AA:FLAT14', { accessMethod: 'CODE', gateCode: '1234' });
    await resolver.setAccess('SW1A1AA:FLAT14', { accessMethod: 'CODE', gateCode: '1234' });
    const result = await resolver.getAccess('SW1A1AA:FLAT14');
    expect(result!.confidenceScore).toBe(2);
  });

  it('processReport: SUCCESS updates status and code', async () => {
    await resolver.setAccess('SW1A1AA:FLAT14', { accessMethod: 'CODE', gateCode: '0000' });
    await resolver.processReport({
      propertyId: 'SW1A1AA:FLAT14',
      driverId: 'driver-1',
      outcome: 'SUCCESS',
      updatedCode: '5678',
      reportedAt: new Date().toISOString(),
    });
    const result = await resolver.getAccess('SW1A1AA:FLAT14');
    expect(result!.gateCode).toBe('5678');
    expect(result!.accessStatus).toBe('WORKING');
  });

  it('processReport: CODE_MISSING sets flag', async () => {
    await resolver.setAccess('SW1A1AA:FLAT15', { accessMethod: 'CODE' });
    await resolver.processReport({
      propertyId: 'SW1A1AA:FLAT15',
      driverId: 'driver-2',
      outcome: 'CODE_MISSING',
      reportedAt: new Date().toISOString(),
    });
    const result = await resolver.getAccess('SW1A1AA:FLAT15');
    expect(result!.codeMissingFlagged).toBe(true);
  });

  it('processReport: FAILED marks status BROKEN', async () => {
    await resolver.setAccess('EC1A1BB', { accessMethod: 'INTERCOM', intercomUnit: '4' });
    await resolver.processReport({
      propertyId: 'EC1A1BB',
      driverId: 'driver-3',
      outcome: 'FAILED',
      reportedAt: new Date().toISOString(),
    });
    const result = await resolver.getAccess('EC1A1BB');
    expect(result!.accessStatus).toBe('BROKEN');
  });

  describe('buildAdvisory', () => {
    it('returns gate code advisory for CODE method', async () => {
      await resolver.setAccess('SW1A1AA:FLAT14', { accessMethod: 'CODE', gateCode: '9999', accessStatus: 'WORKING' });
      const access = await resolver.getAccess('SW1A1AA:FLAT14');
      const advisory = resolver.buildAdvisory(access);
      expect(advisory).toContain('9999');
    });

    it('warns when code is missing', async () => {
      await resolver.setAccess('SW1A1AA:FLAT16', { accessMethod: 'CODE', gateCode: null });
      const access = await resolver.getAccess('SW1A1AA:FLAT16');
      const advisory = resolver.buildAdvisory(access);
      expect(advisory).toContain('not on file');
    });

    it('returns null for null input', () => {
      expect(resolver.buildAdvisory(null)).toBeNull();
    });

    it('includes broken warning when status is BROKEN', async () => {
      await resolver.setAccess('EC1A1BB', { accessMethod: 'CODE', gateCode: '0000', accessStatus: 'BROKEN' });
      const access = await resolver.getAccess('EC1A1BB');
      const advisory = resolver.buildAdvisory(access);
      expect(advisory).toContain('not working');
    });
  });
});
