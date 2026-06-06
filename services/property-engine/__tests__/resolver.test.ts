/**
 * Property Engine — resolver unit tests
 * Mocks fetch so no real HTTP calls are made.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { resolveAddress } from '../src/resolver';

const nominatimResponse = [
  {
    lat: '51.5074',
    lon: '-0.1278',
    display_name: '10 Downing Street, Westminster, London, SW1A 2AA',
    type: 'house',
    importance: 0.85,
    address: { house_number: '10', road: 'Downing Street', postcode: 'SW1A 2AA' },
  },
];

const postcodeResponse = {
  result: { latitude: 51.5033, longitude: -0.1276, postcode: 'SW1A 2AA' },
};

beforeEach(() => {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('nominatim')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(nominatimResponse) });
    }
    if (url.includes('postcodes.io')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(postcodeResponse) });
    }
    return Promise.resolve({ ok: false });
  });
});

afterEach(() => jest.clearAllMocks());

describe('resolveAddress', () => {
  it('returns a HIGH confidence pin for a house with road + number', async () => {
    const result = await resolveAddress({ rawAddress: '10 Downing Street, London SW1A 2AA' });
    expect(result.primary.lat).toBeCloseTo(51.5074, 3);
    expect(result.primary.lng).toBeCloseTo(-0.1278, 3);
    expect(result.primary.confidence).toBe('HIGH');
    expect(result.primary.source).toBe('nominatim');
  });

  it('resolvedIn is a positive number', async () => {
    const result = await resolveAddress({ rawAddress: '10 Downing Street, London' });
    expect(result.resolvedIn).toBeGreaterThanOrEqual(0);
  });

  it('falls back to postcode centroid when Nominatim fails', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('nominatim')) return Promise.resolve({ ok: false });
      if (url.includes('postcodes.io')) return Promise.resolve({ ok: true, json: () => Promise.resolve(postcodeResponse) });
      return Promise.resolve({ ok: false });
    });

    const result = await resolveAddress({ rawAddress: 'Some Farm, SW1A 2AA', postcode: 'SW1A 2AA' });
    expect(result.primary.source).toBe('postcode_centroid');
    expect(result.primary.confidence).toBe('LOW');
  });

  it('throws when nothing can resolve the address', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    await expect(
      resolveAddress({ rawAddress: 'Nonexistent Place, ZZ99 9ZZ' })
    ).rejects.toThrow('Cannot resolve address');
  });
});
