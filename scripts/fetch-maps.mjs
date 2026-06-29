/**
 * scripts/fetch-maps.mjs
 * Bakes MapTiler static map images into apps/landing/public/img/maps/
 *
 * BUILD-TIME ONLY. The MAPTILER_KEY env var MUST NOT ship to the client.
 * Called from Dockerfile landing-builder when ARG MAPTILER_KEY is set.
 *
 * Usage:
 *   MAPTILER_KEY=... node scripts/fetch-maps.mjs
 *
 * MapTiler Static Maps API:
 *   https://api.maptiler.com/maps/{style}/static/{lon},{lat},{zoom}/{w}x{h}@2x.png?key=KEY
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../apps/landing/public/img/maps');

const key = process.env.MAPTILER_KEY;
if (!key) {
  console.log('[fetch-maps] MAPTILER_KEY not set — using committed SVG fallbacks.');
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });

// MapTiler Static Maps API URL builder
// Allowed origins: https://mjmapsystems.com — set in MapTiler dashboard
function maptilerUrl({ style, lon, lat, zoom, w, h }) {
  return `https://api.maptiler.com/maps/${style}/static/${lon},${lat},${zoom}/${w}x${h}@2x.png?key=${key}`;
}

const maps = [
  {
    name: 'before-postcode-centroid.png',
    style: 'dataviz-dark',
    lon: -0.0865, lat: 51.5231, zoom: 17,
    w: 640, h: 400,
    desc: 'Street-level view showing postcode centroid vs actual gate',
  },
  {
    name: 'after-gate-pin.png',
    style: 'hybrid',
    lon: -0.0872, lat: 51.5228, zoom: 18,
    w: 640, h: 400,
    desc: 'Satellite view with exact gate pin',
  },
  {
    name: 'hero-map.png',
    style: 'dataviz-dark',
    lon: -0.1278, lat: 51.5074, zoom: 12,
    w: 1280, h: 800,
    desc: 'Wide area delivery route view',
  },
  {
    name: 'junction-map.png',
    style: 'dataviz-dark',
    lon: -0.1500, lat: 51.5100, zoom: 16,
    w: 640, h: 400,
    desc: 'Junction with turn-score warning zone',
  },
];

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status === 429) {
        const wait = Math.pow(2, i) * 1000;
        console.warn(`[fetch-maps] Rate limited, retrying in ${wait}ms…`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.error(`[fetch-maps] HTTP ${res.status} for ${url}`);
      return null;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

async function fetchMap(map) {
  const url = maptilerUrl(map);
  console.log(`[fetch-maps] Fetching ${map.name}…`);
  const res = await fetchWithRetry(url);
  if (!res) {
    console.warn(`[fetch-maps] Skipping ${map.name} — fetch failed, SVG fallback will be used`);
    return;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = join(OUT, map.name);
  writeFileSync(outPath, buf);
  console.log(`[fetch-maps] Saved ${map.name} (${(buf.length / 1024).toFixed(0)} KB)`);
}

// Fetch sequentially to avoid rate limits
for (const map of maps) {
  await fetchMap(map).catch(e => console.error(`[fetch-maps] Error fetching ${map.name}:`, e.message));
}

console.log('[fetch-maps] Done');
