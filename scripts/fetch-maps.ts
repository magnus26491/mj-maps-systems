#!/usr/bin/env npx ts-node
/**
 * scripts/fetch-maps.ts — Build-time map image baker
 *
 * Downloads real MapTiler static map images and saves them to apps/landing/public/img/.
 * Run as part of the landing-builder Docker stage when MAPTILER_KEY is set.
 *
 * Usage:
 *   npx ts-node scripts/fetch-maps.ts
 *   MAPTILER_KEY=... npx ts-node scripts/fetch-maps.ts
 *
 * If MAPTILER_KEY is absent, the script prints instructions and exits 0
 * (the committed SVG fallbacks in public/img/ already cover all cases).
 *
 * Outputs:
 *   apps/landing/public/img/before-postcode-centroid.png  — dark street, zoom 14, postcode centroid
 *   apps/landing/public/img/after-gate-pin.png           — satellite/hybrid, zoom 17, gate pin
 *   apps/landing/public/img/hero-map.png                 — dark street, zoom 10, rural route
 *   apps/landing/public/img/junction-map.png             — dark street, zoom 16, junction scene
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// ── Types ────────────────────────────────────────────────────────────────────

interface MapConfig {
  /** Output filename (saved to apps/landing/public/img/) */
  outFile: string;
  /** MapTiler style slug */
  style: string;
  /** Centre longitude */
  lon: number;
  /** Centre latitude */
  lat: number;
  /** Zoom level */
  zoom: number;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Optional pin: format "pin-s+HEX(lon,lat)" or null */
  marker?: string;
  /** Whether to request @2x (retina) */
  retina?: boolean;
  /** Human description for logging */
  description: string;
}

// ── Map configurations ────────────────────────────────────────────────────────

const MAPS: MapConfig[] = [
  // 1. Before: postcode centroid — dark street style, zoomed out
  //    WR14 3HX centroid (Malvern, Worcestershire — real UK postcode area)
  {
    outFile: 'before-postcode-centroid.png',
    style: 'streets-v2-dark',
    lon: -2.337,
    lat: 52.130,
    zoom: 14,
    width: 600,
    height: 400,
    // Blue marker at centroid (wrong spot — mid-street)
    marker: 'pin-s+3B82F6(-2.337,52.130)',
    retina: true,
    description: 'Dark street map, WR14 3HX postcode centroid, blue marker mid-street',
  },

  // 2. After: gate pin — satellite hybrid, zoomed in
  //    Same location, zoomed in on a specific property, teal MJ Maps pin
  {
    outFile: 'after-gate-pin.png',
    style: 'hybrid',
    lon: -2.337,
    lat: 52.130,
    zoom: 17,
    width: 600,
    height: 400,
    // Teal MJ Maps pin at the property gate
    marker: 'pin-s+00C2A8(-2.337,52.130)',
    retina: true,
    description: 'Satellite hybrid, WR14 3HX gate pin, teal marker at driveway',
  },

  // 3. Hero: rural route overview — dark street, zoomed out
  //    Rural Worcestershire lane with route polyline overlay
  {
    outFile: 'hero-map.png',
    style: 'dataviz-dark',
    lon: -2.310,
    lat: 52.120,
    zoom: 10,
    width: 800,
    height: 500,
    retina: true,
    description: 'Dark dataviz map, Worcestershire rural route overview',
  },

  // 4. Junction: close-up road junction — dark street, zoomed in
  //    Real UK junction near Malvern
  {
    outFile: 'junction-map.png',
    style: 'streets-v2-dark',
    lon: -2.322,
    lat: 52.128,
    zoom: 16,
    width: 640,
    height: 420,
    retina: true,
    description: 'Dark street map, close-up Worcestershire junction',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const LANDING_PUBLIC_IMG = path.resolve(__dirname, 'apps/landing/public/img');

function getApiKey(): string | null {
  return (
    process.env.MAPTILER_KEY ??
    process.env.MAP_TILER_KEY ??   // legacy alias
    null
  );
}

function buildStaticUrl(cfg: MapConfig, apiKey: string): string {
  const retina = cfg.retina ? '@2x' : '';
  const marker = cfg.marker ? `${cfg.marker}/` : '';
  return (
    `https://api.maptiler.com/maps/${cfg.style}/static/` +
    `${marker}${cfg.lon},${cfg.lat},${cfg.zoom}/` +
    `${cfg.width}x${cfg.height}${retina}.png?key=${apiKey}`
  );
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (response) => {
        if (response.statusCode === 401 || response.statusCode === 403) {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`MapTiler auth failed (${response.statusCode}) — check MAPTILER_KEY`));
          return;
        }
        if (response.statusCode === 404) {
          file.close();
          fs.unlinkSync(destPath);
          reject(new Error(`MapTiler 404 — style "${url.split('/')[4]}" not found`));
          return;
        }
        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`MapTiler returned ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlinkSync(destPath);
        reject(err);
      });
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.log('\n⚠  MAPTILER_KEY not set — skipping MapTiler image download.\n');
    console.log('   The committed SVG fallbacks in apps/landing/public/img/ will be used:');
    console.log('   • before-postcode-centroid.svg');
    console.log('   • after-gate-pin.svg');
    console.log('   • hero-map.svg');
    console.log('   • junction-map.svg');
    console.log('\n   To bake real MapTiler images, set MAPTILER_KEY and re-run:');
    console.log('   MAPTILER_KEY=<key> npx ts-node scripts/fetch-maps.ts\n');
    console.log('   Get a free key at https://maptiler.com — 100k tiles/month free.\n');
    process.exit(0);
  }

  // Also support legacy MAP_TILER_KEY env var name with a warning
  if (process.env.MAP_TILER_KEY && !process.env.MAPTILER_KEY) {
    console.warn('⚠  MAP_TILER_KEY is deprecated — rename to MAPTILER_KEY');
  }

  console.log(`\n🗺  MJ Maps — MapTiler image baker`);
  console.log(`   API key: ${apiKey.slice(0, 6)}…${apiKey.slice(-4)}\n`);

  ensureDir(LANDING_PUBLIC_IMG);

  let downloaded = 0;
  let skipped = 0;

  for (const cfg of MAPS) {
    const dest = path.join(LANDING_PUBLIC_IMG, cfg.outFile);
    const url = buildStaticUrl(cfg, apiKey);

    process.stdout.write(`   [${downloaded + skipped + 1}/${MAPS.length}] ${cfg.outFile} … `);

    try {
      await downloadFile(url, dest);
      const size = fs.statSync(dest).size;
      console.log(`✅ ${formatBytes(size)}`);

      // Validate: check it's a real PNG (magic bytes 89 50 4E 47)
      const header = fs.readFileSync(dest).slice(0, 4);
      const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
      if (!isPng) {
        console.warn(`   ⚠  Warning: ${cfg.outFile} may not be a valid PNG`);
      }

      downloaded++;
    } catch (err: any) {
      if (err.message.includes('auth failed')) {
        console.error(`❌ Auth failed — ${err.message}`);
        process.exit(1);
      }
      if (err.message.includes('404')) {
        console.error(`❌ 404 — ${err.message}`);
        process.exit(1);
      }
      console.error(`❌ ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n   Done: ${downloaded} downloaded, ${skipped} failed`);
  if (downloaded > 0) {
    console.log(`   Images saved to: ${LANDING_PUBLIC_IMG}\n`);
  } else {
    console.log(`   No images downloaded — committed SVG fallbacks will be used.\n`);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
