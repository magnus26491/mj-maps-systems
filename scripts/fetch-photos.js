#!/usr/bin/env node
/**
 * scripts/fetch-photos.js
 * Downloads real photos from Unsplash by photo ID and converts them to
 * optimised WebP (+ fallback PNG) ready for use in the landing site.
 *
 * Replaces the old SVG-to-PNG pipeline entirely — real photos only.
 *
 * Usage:
 *   node scripts/fetch-photos.js              # process all slugs in manifest
 *   node scripts/fetch-photos.js hero-van-dawn # single slug
 *
 * Requirements: sharp  (npm i -D sharp)
 * Unsplash source API is free for development use; no API key required for
 * the source.unsplash.com CDN which serves photos at the specified dimensions.
 *
 * For production you should obtain an Unsplash API key and use the official
 * /photos/:id/download endpoint to respect their download-tracking requirement.
 * Set UNSPLASH_ACCESS_KEY env var and this script will use it automatically.
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const sharp   = require('sharp');

const MANIFEST  = path.join(__dirname, 'photo-manifest.json');
const OUT_DIR   = path.join(__dirname, '..', 'apps', 'landing', 'public', 'img', 'photos');
const TMP_DIR   = path.join(__dirname, '..', '.tmp-photo-fetch');

// ── helpers ────────────────────────────────────────────────────────────────

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = (u, redirects = 0) => {
      if (redirects > 8) return reject(new Error('Too many redirects: ' + u));
      https.get(u, { headers: { 'User-Agent': 'MJMaps-photo-fetcher/1.0' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return req(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    req(url);
  });
}

function buildUrl(photo) {
  // If an API key is set, use the official Unsplash API (respects download tracking)
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (key) {
    // Returns a download URL via the Unsplash API
    return `https://api.unsplash.com/photos/${photo.unsplash_id}/download?client_id=${key}`;
  }
  // Free source CDN — suitable for development / CI
  const w = photo.width  || 1920;
  const h = photo.height || 1080;
  return `https://images.unsplash.com/photo-${photo.unsplash_id}?auto=format&fit=crop&w=${w}&h=${h}&q=85`;
}

async function processPhoto(photo) {
  const { slug, width = 1920, height = 1080 } = photo;
  console.log(`\n📷  ${slug}  (${photo.unsplash_id})`);

  const tmpRaw   = path.join(TMP_DIR, `${slug}.raw`);
  const outPng   = path.join(OUT_DIR,  `${slug}.png`);
  const outWebp  = path.join(OUT_DIR,  `${slug}.webp`);
  const outWebp2 = path.join(OUT_DIR,  `${slug}@2x.webp`);

  // ── 1. Fetch raw bytes ───────────────────────────────────────────────────
  const url = buildUrl(photo);
  console.log(`   ↓ ${url}`);
  const buf = await fetchBuffer(url);
  fs.writeFileSync(tmpRaw, buf);
  console.log(`   ✓ downloaded ${(buf.length / 1024).toFixed(0)} KB`);

  // ── 2. Decode with sharp, crop to target aspect ratio ───────────────────
  const img = sharp(buf).resize(width, height, { fit: 'cover', position: 'centre' });

  // ── 3. Output PNG (fallback) ─────────────────────────────────────────────
  await img.clone().png({ compressionLevel: 8 }).toFile(outPng);
  console.log(`   ✓ ${path.basename(outPng)} — ${(fs.statSync(outPng).size / 1024).toFixed(0)} KB`);

  // ── 4. Output WebP @1x ───────────────────────────────────────────────────
  await img.clone().webp({ quality: 82, effort: 5 }).toFile(outWebp);
  console.log(`   ✓ ${path.basename(outWebp)} — ${(fs.statSync(outWebp).size / 1024).toFixed(0)} KB`);

  // ── 5. Output WebP @2x (double resolution from Unsplash, same crop) ──────
  const url2x = buildUrl({ ...photo, width: width * 2, height: height * 2 });
  const buf2x = await fetchBuffer(url2x);
  await sharp(buf2x)
    .resize(width * 2, height * 2, { fit: 'cover', position: 'centre' })
    .webp({ quality: 78, effort: 5 })
    .toFile(outWebp2);
  console.log(`   ✓ ${path.basename(outWebp2)} — ${(fs.statSync(outWebp2).size / 1024).toFixed(0)} KB`);

  // ── 6. Cleanup tmp ───────────────────────────────────────────────────────
  fs.unlinkSync(tmpRaw);
  console.log(`   ✅ ${slug} done`);
}

// ── Main ────────────────────────────────────────────────────────────────────

ensureDir(OUT_DIR);
ensureDir(TMP_DIR);

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const args     = process.argv.slice(2);

let photos = manifest.photos;
if (args.length > 0) {
  photos = photos.filter(p => args.includes(p.slug));
  if (photos.length === 0) {
    console.error('No matching slugs found for:', args.join(', '));
    process.exit(1);
  }
}

console.log('\n🖼   MJ Maps — Unsplash photo fetcher');
console.log(`   Manifest: ${MANIFEST}`);
console.log(`   Output:   ${OUT_DIR}`);
console.log(`   Photos:   ${photos.length}\n`);

(async () => {
  for (const photo of photos) {
    try {
      await processPhoto(photo);
    } catch (err) {
      console.error(`\n❌  ${photo.slug}: ${err.message}`);
      if (!args.length) process.exit(1);
    }
  }

  // Clean up tmp dir if empty
  try {
    const remaining = fs.readdirSync(TMP_DIR);
    if (remaining.length === 0) fs.rmdirSync(TMP_DIR);
  } catch {}

  console.log('\n✅  All photos fetched and converted.\n');
})();
