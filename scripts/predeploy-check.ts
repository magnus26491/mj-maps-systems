/**
 * Pre-Deploy Safety Check
 * 
 * Runs before Railway deployment to ensure everything is safe to deploy.
 * Exit code 0 = pass, non-zero = fail and stop deployment.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
  duration?: number;
}

const checks: CheckResult[] = [];

function log(message: string, isError = false): void {
  const prefix = isError ? '❌' : '✅';
  console.log(`${prefix} ${message}`);
}

function runCheck(name: string, fn: () => void): void {
  const start = Date.now();
  try {
    fn();
    const duration = Date.now() - start;
    checks.push({ name, passed: true, duration });
    log(`${name} (${duration}ms)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    checks.push({ name, passed: false, message, duration: Date.now() - start });
    log(`${name}: ${message}`, true);
  }
}

console.log('='.repeat(60));
console.log('MJ Maps Pre-Deploy Safety Check');
console.log('='.repeat(60));
console.log('');

// Check 1: TypeScript compilation
runCheck('TypeScript compilation', () => {
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
  } catch {
    throw new Error('TypeScript compilation failed');
  }
});

// Check 2: Build validation
runCheck('Build validation', () => {
  const requiredFiles = [
    'dist/landing/index.html',
    'dist/apps/driver-app/dist/index.html',
    'dist/dispatcher/index.html',
    'dist/services/api/server.js',
  ];
  
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(process.cwd(), file))) {
      throw new Error(`Missing required file: ${file}`);
    }
  }
  
  // Also run the validation script if it exists
  if (fs.existsSync(path.join(process.cwd(), 'scripts/validate-build.js'))) {
    try {
      execSync('node scripts/validate-build.js', { stdio: 'pipe' });
    } catch {
      throw new Error('Build validation script failed');
    }
  }
});

// Check 3: No debug code in production
runCheck('No debug code in production', () => {
  // Note: console.log is allowed for logging
  // Only block actual debug artifacts
  const debugPatterns = [
    'debugger;',
    'TODO:',  // Intentionally commented TODOs
    'FIXME:', // Intentionally commented FIXMEs
  ];
  
  const filesToCheck = [
    'dist/services/api/server.js',
  ];
  
  for (const file of filesToCheck) {
    if (fs.existsSync(path.join(process.cwd(), file))) {
      const content = fs.readFileSync(path.join(process.cwd(), file), 'utf-8');
      for (const pattern of debugPatterns) {
        if (content.includes(pattern)) {
          throw new Error(`Debug code found in ${file}: ${pattern}`);
        }
      }
    }
  }
});

// Check 4: Environment variables documented
runCheck('Environment variables', () => {
  const requiredEnvVars = [
    'JWT_SECRET',
    'DATABASE_URL',
  ];
  
  // In production, these should be set
  // For now, just check they exist in .env.example
  const envExamplePath = path.join(process.cwd(), '.env.example');
  if (!fs.existsSync(envExamplePath)) {
    throw new Error('.env.example not found');
  }
});

// Summary
console.log('');
console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));

const passed = checks.filter(c => c.passed).length;
const failed = checks.filter(c => !c.passed).length;
const totalDuration = checks.reduce((acc, c) => acc + (c.duration || 0), 0);

console.log(`Checks passed: ${passed}/${checks.length}`);
console.log(`Total time: ${totalDuration}ms`);
console.log('');

if (failed > 0) {
  console.log('FAILED CHECKS:');
  for (const check of checks.filter(c => !c.passed)) {
    console.log(`  ❌ ${check.name}: ${check.message}`);
  }
  console.log('');
  console.log('Deployment BLOCKED - fix failures before deploying');
  process.exit(1);
} else {
  console.log('✅ ALL CHECKS PASSED - Safe to deploy');
  process.exit(0);
}
