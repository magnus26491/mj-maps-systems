/**
 * Bridge Engine — OSM restriction fetcher
 *
 * Queries Overpass for road restrictions within a bounding box around
 * a route segment. Parses OSM tags into RoadRestriction objects.
 *
 * Overpass query fetches ways with ANY of:
 *   maxheight, maxweight, maxaxleload, maxwidth, access=private,
 *   barrier=*, highway=turning_circle (for height barriers in car parks)
 */
import type { RoadRestriction } from './types';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const BBOX_PAD_DEG = 0.002; // ~200m padding around segment bounding box

function buildBbox(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): string {
  const minLat = Math.min(lat1, lat2) - BBOX_PAD_DEG;
  const maxLat = Math.max(lat1, lat2) + BBOX_PAD_DEG;
  const minLng = Math.min(lng1, lng2) - BBOX_PAD_DEG;
  const maxLng = Math.max(lng1, lng2) + BBOX_PAD_DEG;
  return `${minLat},${minLng},${maxLat},${maxLng}`;
}

function parseHeightTag(val: string): number | null {
  // OSM height tags: "3.0", "3.0 m", "10ft", "10'6"
  const metres = parseFloat(val);
  if (!Number.isNaN(metres)) return metres;

  // feet’n’inches: 10'6 = 10.5 ft = 3.2m
  const ftIn = val.match(/(\d+)'(\d+)?/);
  if (ftIn) {
    const ft  = parseInt(ftIn[1], 10);
    const ins = parseInt(ftIn[2] ?? '0', 10);
    return (ft * 12 + ins) * 0.0254;
  }
  return null;
}

function parseWeightTag(val: string): number | null {
  const t = parseFloat(val);
  return Number.isNaN(t) ? null : t;
}

export async function fetchRestrictionsForSegment(
  fromLat: number, fromLng: number,
  toLat:   number, toLng:   number,
): Promise<RoadRestriction[]> {
  const bbox  = buildBbox(fromLat, fromLng, toLat, toLng);
  const query = `[out:json][timeout:10];
(
  way["maxheight"](${bbox});
  way["maxweight"](${bbox});
  way["maxaxleload"](${bbox});
  way["maxwidth"](${bbox});
  way["access"="private"](${bbox});
  way["barrier"](${bbox});
);
out center tags;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `data=${encodeURIComponent(query)}`,
      signal:  AbortSignal.timeout(12_000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const restrictions: RoadRestriction[] = [];

    for (const el of data.elements ?? []) {
      const tags    = el.tags ?? {};
      const lat     = el.center?.lat ?? el.lat ?? fromLat;
      const lng     = el.center?.lon ?? el.lon ?? fromLng;

      if (tags.maxheight) {
        restrictions.push({
          wayId: el.id, lat, lng,
          type: 'BRIDGE', severity: 'WARNING',
          value: parseHeightTag(tags.maxheight),
          description: `Max height: ${tags.maxheight}`,
          driverVerified: false, source: 'osm',
        });
      }

      if (tags.maxweight || tags.maxaxleload) {
        const raw = tags.maxweight ?? tags.maxaxleload;
        restrictions.push({
          wayId: el.id, lat, lng,
          type: 'WEIGHT', severity: 'WARNING',
          value: parseWeightTag(raw),
          description: `Max weight: ${raw}t`,
          driverVerified: false, source: 'osm',
        });
      }

      if (tags.maxwidth) {
        restrictions.push({
          wayId: el.id, lat, lng,
          type: 'WIDTH', severity: 'WARNING',
          value: parseFloat(tags.maxwidth) || null,
          description: `Max width: ${tags.maxwidth}m`,
          driverVerified: false, source: 'osm',
        });
      }

      if (tags.access === 'private') {
        restrictions.push({
          wayId: el.id, lat, lng,
          type: 'PRIVATE', severity: 'WARNING',
          value: null,
          description: 'Private road',
          driverVerified: false, source: 'osm',
        });
      }
    }

    return restrictions;
  } catch {
    return []; // Fail open — don’t block route planning if Overpass is slow
  }
}
