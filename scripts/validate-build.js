/**
 * Build Validation Script
 * 
 * Validates that all required build artifacts exist.
 * Fails the build if any required file is missing.
 */

const fs = require('fs');
const path = require('path');

// Frontend artifacts are built by Docker multi-stage build.
// Locally (npm run build = tsc only), they may not exist.
// Docker has its own validation step that enforces these.
const FRONTEND_FILES = [
  'dist/landing/index.html',
  'dist/apps/driver-app/dist/index.html',
  'dist/dispatcher/index.html',
];

// These MUST exist after any build
const REQUIRED_FILES = [
  'dist/services/api/server.js',
];

const REQUIRED_DIRS = [
  'dist/services/db/migrations',
];

let errors = [];

console.log('='.repeat(60));
console.log('MJ Maps Build Validation');
console.log('='.repeat(60));
console.log('');

// Check files
console.log('Validating required backend files:');
for (const file of REQUIRED_FILES) {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    console.log(`  ✅ ${file} (${stats.size} bytes)`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    errors.push(`Missing file: ${file}`);
  }
}

// Frontend files — warn only (built in Docker, not locally)
console.log('');
console.log('Frontend artifacts (built by Docker multi-stage build):');
let frontendMissing = false;
for (const file of FRONTEND_FILES) {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    console.log(`  ✅ ${file} (${stats.size} bytes)`);
  } else {
    console.log(`  ⚠️  ${file} - not present (build with Docker for full artifact set)`);
    frontendMissing = true;
  }
}
if (frontendMissing) {
  console.log('  → Run docker build to generate frontend artifacts');
}

console.log('');

// Check directories
console.log('Validating required directories:');
for (const dir of REQUIRED_DIRS) {
  const fullPath = path.join(process.cwd(), dir);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    console.log(`  ✅ ${dir}/`);
  } else {
    console.log(`  ❌ ${dir}/ - MISSING`);
    errors.push(`Missing directory: ${dir}`);
  }
}

console.log('');
console.log('='.repeat(60));

if (errors.length > 0) {
  console.log('BUILD VALIDATION FAILED');
  console.log('='.repeat(60));
  for (const error of errors) {
    console.log(`  ❌ ${error}`);
  }
  process.exit(1);
} else {
  console.log('✅ All build validations passed');
  console.log('='.repeat(60));
  process.exit(0);
}
