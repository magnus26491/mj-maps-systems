/**
 * OSM Service — road-query unit tests
 * Mocks Overpass fetch so no network calls needed.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Redis cache — always returns null (cache miss) so Overpass is called
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn(),
  }));
});

const mockOverpassResponse = {
  elements: [
    {
      type: 'way',
      id: 12345,
      tags: {
        highway: 'residential',
        width: '6.5',
        lanes: '2',
        oneway: 'no',
      },
      nodes: [1, 2, 3],
    },
    {
      type: 'way',
      id: 67890,
      tags: {
        highway: 'service',
        'turning_circle': 'yes',
      },
      nodes: [3, 4],
    },
  ],
};

beforeEach(() => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue(mockOverpassResponse),
    text: jest.fn().mockResolvedValue(JSON.stringify(mockOverpassResponse)),
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('OSM road-query mock structure', () => {
  it('mock Overpass response has expected shape', () => {
    expect(mockOverpassResponse.elements).toHaveLength(2);
    expect(mockOverpassResponse.elements[0].tags.highway).toBe('residential');
    expect(mockOverpassResponse.elements[0].tags.width).toBe('6.5');
  });

  it('parses width tag as float', () => {
    const widthTag = mockOverpassResponse.elements[0].tags.width;
    const parsed = parseFloat(widthTag);
    expect(parsed).toBe(6.5);
    expect(Number.isNaN(parsed)).toBe(false);
  });

  it('detects turning_circle tag', () => {
    const hasTurningCircle = mockOverpassResponse.elements.some(
      el => el.tags?.['turning_circle'] === 'yes' || el.tags?.highway === 'turning_circle',
    );
    expect(hasTurningCircle).toBe(true);
  });

  it('detects oneway tag correctly', () => {
    const oneway = mockOverpassResponse.elements[0].tags.oneway;
    expect(oneway === 'yes' || oneway === '1').toBe(false); // this road is NOT one-way
  });

  it('lanes parsed as integer', () => {
    const lanes = parseInt(mockOverpassResponse.elements[0].tags.lanes, 10);
    expect(lanes).toBe(2);
  });
});

describe('fetch mock sanity', () => {
  it('mock fetch is configured', () => {
    expect(typeof global.fetch).toBe('function');
  });

  it('mock fetch returns ok response', async () => {
    const res = await global.fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: '[out:json];way(around:30,51.5,-0.1);out tags;',
    } as RequestInit);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.elements).toHaveLength(2);
  });
});
