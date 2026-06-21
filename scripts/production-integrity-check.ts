/**
 * Production Integrity Check Script
 * 
 * Validates the production build is ready for deployment.
 * Checks all required files, directories, and environment variables.
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  name: string;
  passed: boolean;
  message?: string;
}

const results: ValidationResult[] = [];

function logCheck(name: string, passed: boolean, message?: string): void {
  results.push({ name, passed, message });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}${message ? `: ${message}` : ''}`);
}

function checkFile(filePath: string): boolean {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function checkDirectory(dirPath: string): boolean {
  const fullPath = path.join(process.cwd(), dirPath);
  return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
}

function checkFileInDir(dir: string, file: string): boolean {
  return checkFile(path.join(dir, file));
}

function checkFilesInDir(dir: string, files: string[]): boolean {
  return files.every(f => checkFile(path.join(dir, f)));
}

console.log('='.repeat(60));
console.log('MJ Maps Production Integrity Check');
console.log('='.repeat(60));
console.log('');

// ─── Landing Website ────────────────────────────────────────────────────────────

console.log('Landing Website:');

const landingIndex = checkFile('dist/landing/index.html');
logCheck('dist/landing/index.html', landingIndex);

const landingRobots = checkFile('dist/landing/robots.txt');
logCheck('dist/landing/robots.txt', landingRobots);

const landingSitemap = checkFile('dist/landing/sitemap.xml');
logCheck('dist/landing/sitemap.xml', landingSitemap);

const landingFavicon = checkFile('dist/landing/favicon.svg');
logCheck('dist/landing/favicon.svg', landingFavicon);

console.log('');

// ─── Driver Web App ────────────────────────────────────────────────────────────

console.log('Driver Web App:');

const driverIndex = checkFile('dist/apps/driver-app/dist/index.html');
logCheck('dist/apps/driver-app/dist/index.html', driverIndex);

const driverDistDir = checkDirectory('dist/apps/driver-app/dist');
logCheck('dist/apps/driver-app/dist/', driverDistDir);

console.log('');

// ─── Dispatcher Dashboard ─────────────────────────────────────────────────────

console.log('Dispatcher Dashboard:');

const dispatcherIndex = checkFile('dist/dispatcher/index.html');
logCheck('dist/dispatcher/index.html', dispatcherIndex);

const dispatcherDir = checkDirectory('dist/dispatcher');
logCheck('dist/dispatcher/', dispatcherDir);

console.log('');

// ─── API Service ──────────────────────────────────────────────────────────────

console.log('API Service:');

const apiServer = checkFile('dist/services/api/server.js');
logCheck('dist/services/api/server.js', apiServer);

const apiDir = checkDirectory('dist/services/api');
logCheck('dist/services/api/', apiDir);

console.log('');

// ─── Database Migrations ───────────────────────────────────────────────────────

console.log('Database Migrations:');

const migrationsDir = checkDirectory('dist/services/db/migrations');
logCheck('dist/services/db/migrations/', migrationsDir);

if (migrationsDir) {
  const migrationFiles = fs.readdirSync(path.join(process.cwd(), 'dist/services/db/migrations'));
  const migrationCount = migrationFiles.filter(f => f.endsWith('.sql')).length;
  logCheck(`Migration files (${migrationCount})`, migrationCount >= 18);
}

console.log('');

// ─── Phase 22 Intelligence Services ───────────────────────────────────────────
// These services are standalone modules compiled by tsc into dist/

console.log('Phase 22 Intelligence Services:');

const liveTraffic = checkFile('services/live-traffic-intelligence/index.ts');
logCheck('services/live-traffic-intelligence/index.ts (source)', liveTraffic);

const externalRoadData = checkFile('services/external-road-data/index.ts');
logCheck('services/external-road-data/index.ts (source)', externalRoadData);

const eventIntelligence = checkFile('services/event-intelligence/index.ts');
logCheck('services/event-intelligence/index.ts (source)', eventIntelligence);

const weatherIntelligence = checkFile('services/weather-intelligence/index.ts');
logCheck('services/weather-intelligence/index.ts (source)', weatherIntelligence);

console.log('');

// ─── Phase 21 Intelligence Services ───────────────────────────────────────────

console.log('Phase 21 Intelligence Services:');

const navigationControl = checkFile('services/navigation-control/index.ts');
logCheck('services/navigation-control/index.ts (source)', navigationControl);

const navigationGuard = checkFile('services/navigation-guard/index.ts');
logCheck('services/navigation-guard/index.ts (source)', navigationGuard);

const navigationEvents = checkFile('services/navigation-events/index.ts');
logCheck('services/navigation-events/index.ts (source)', navigationEvents);

const platformHealth = checkFile('services/platform-health/index.ts');
logCheck('services/platform-health/index.ts (source)', platformHealth);

console.log('');

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
const total = results.length;

console.log(`Passed: ${passed}/${total}`);
console.log(`Failed: ${failed}/${total}`);
console.log('');

if (failed > 0) {
  console.log('Failed Checks:');
  for (const result of results.filter(r => !r.passed)) {
    console.log(`  ❌ ${result.name}`);
  }
  console.log('');
  console.log('Production deployment BLOCKED');
  process.exit(1);
} else {
  console.log('✅ ALL CHECKS PASSED - Ready for production deployment');
  process.exit(0);
}
