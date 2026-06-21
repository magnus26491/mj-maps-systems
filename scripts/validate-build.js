/**
 * Build Validation Script
 * 
 * Validates that all required build artifacts exist.
 * Fails the build if any required file is missing.
 */

const fs = require('fs');
const path = require('path');

const REQUIRED_FILES = [
  'dist/landing/index.html',
  'dist/apps/driver-app/dist/index.html',
  'dist/dispatcher/index.html',
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
console.log('Validating required files:');
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
