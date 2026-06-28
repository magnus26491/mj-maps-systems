/**
 * scripts/convert-photos.js
 * Converts SVG illustration source files to optimised WebP (+ fallback PNG) at 1x and 2x.
 *
 * Source SVGs live in apps/landing/public/img/photos/ (e.g. hero-van-dawn.svg).
 * Output goes to apps/landing/public/img/photos/ (hero-van-dawn.webp, hero-van-dawn@2x.webp, hero-van-dawn.png).
 *
 * Usage:
 *   node scripts/convert-photos.js
 *   node scripts/convert-photos.js hero-van-dawn    # single file
 *
 * Dependencies: sharp, @playwright/test (chromium-headless-shell already downloaded)
 * Run from repo root: node scripts/convert-photos.js
 */

const fs   = require('fs');
const path = require('path');
const sharp = require('sharp');

// We use chromium via playwright to render SVGs
let playwright;
try { playwright = require('playwright'); } catch { playwright = null; }

const PHOTOS_DIR = path.join(__dirname, '..', 'apps', 'landing', 'public', 'img', 'photos');
const TMP_DIR    = path.join(__dirname, '..', '.tmp-svg-render');

if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });
if (!fs.existsSync(TMP_DIR))    fs.mkdirSync(TMP_DIR,    { recursive: true });

/**
 * Render an SVG to PNG using chromium-headless-shell via a minimal playwright script.
 * @param {string} svgPath   Absolute path to the SVG file
 * @param {string} outPng    Absolute path for the output PNG
 * @param {number} width     Viewport width in pixels
 * @param {number} height    Viewport height in pixels
 */
async function svgToPng(svgPath, outPng, width = 1920, height = 1080) {
  if (!playwright) throw new Error('@playwright/test not installed');

  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  await page.setViewportSize({ width, height });

  // Read SVG as a data URI
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const dataUri    = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;

  await page.goto(dataUri, { waitUntil: 'networkidle' });
  // Give fonts / rendering a moment
  await page.waitForTimeout(500);

  const buf = await page.screenshot({ type: 'png', fullPage: false });
  fs.writeFileSync(outPng, buf);

  await browser.close();
  console.log(`  ✓ ${path.basename(outPng)} (${width}×${height})`);
}

/**
 * Convert PNG to WebP at specified quality.
 */
async function pngToWebP(pngPath, webpPath, quality = 82) {
  await sharp(pngPath)
    .webp({ quality, effort: 4 })
    .toFile(webpPath);
  const sz = fs.statSync(webpPath).size;
  console.log(`  ✓ ${path.basename(webpPath)} — ${(sz / 1024).toFixed(0)} KB`);
}

/**
 * Process one SVG source file.
 */
async function processFile(srcSvg) {
  const base  = path.basename(srcSvg, '.svg');
  const png1x = path.join(PHOTOS_DIR, `${base}.png`);
  const png2x = path.join(TMP_DIR,    `${base}@2x.png`);
  const webp1x = path.join(PHOTOS_DIR, `${base}.webp`);
  const webp2x = path.join(PHOTOS_DIR, `${base}@2x.webp`);

  // Parse viewBox from SVG to determine dimensions
  const svgText  = fs.readFileSync(srcSvg, 'utf8');
  const vbMatch  = svgText.match(/viewBox="(\d+)\s+(\d+)\s+(\d+)\s+(\d+)"/);
  const w = vbMatch ? parseInt(vbMatch[3]) : 1920;
  const h = vbMatch ? parseInt(vbMatch[4]) : 1080;

  console.log(`\nProcessing: ${base} (SVG viewBox ${w}×${h})`);

  // 1. Render SVG → PNG @1x
  await svgToPng(srcSvg, png1x, w, h);

  // 2. Render SVG → PNG @2x
  await svgToPng(srcSvg, png2x, w * 2, h * 2);

  // 3. PNG → WebP @1x  (quality 82 for photos)
  await pngToWebP(png1x, webp1x, 82);

  // 4. PNG @2x → WebP @2x
  await pngToWebP(png2x, webp2x, 78);

  // Clean up 2x PNG (we only keep WebP @2x)
  fs.unlinkSync(png2x);
  console.log(`  ✓ ${base} complete`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let files;

if (args.length > 0) {
  files = args.map(f => path.join(PHOTOS_DIR, f.endsWith('.svg') ? f : `${f}.svg`));
} else {
  files = fs.readdirSync(PHOTOS_DIR)
    .filter(f => f.endsWith('.svg'))
    .map(f  => path.join(PHOTOS_DIR, f));
}

if (files.length === 0) {
  console.log('No .svg files found in', PHOTOS_DIR);
  process.exit(0);
}

console.log(`\n🖼   MJ Maps — SVG → WebP converter`);
console.log(`   Source: ${PHOTOS_DIR}`);
console.log(`   Output: ${PHOTOS_DIR}`);
console.log(`   Files:  ${files.length}\n`);

(async () => {
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.warn(`⚠  Skipping missing: ${f}`);
      continue;
    }
    try {
      await processFile(f);
    } catch (err) {
      console.error(`❌ ${path.basename(f)}: ${err.message}`);
      if (!args.length) process.exit(1); // abort on first error in batch mode
    }
  }
  console.log('\n✅ All conversions done.\n');
})();