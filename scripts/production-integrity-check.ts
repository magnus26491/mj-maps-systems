/**
 * Production Integrity Check
 *
 * Validates the production build by:
 *   (a) Running tsc --noEmit
 *   (b) Booting the compiled server (no DB required) and asserting /api/v1/health returns 200
 *   (c) Asserting auth-gated routes return 401/400 (wired, not crashing)
 *   (d) Checking the DB migrations directory is present
 *
 * File-existence checks for orphaned/incubated services have been removed —
 * they checked that files exist on disk, not that the code runs.
 */

import { execSync, spawn } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

const ROOT = path.resolve(__dirname, '..');

interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
}

const results: CheckResult[] = [];

function log(name: string, passed: boolean, message?: string): void {
  results.push({ name, passed, message });
  console.log(`${passed ? '✅' : '❌'} ${name}${message ? ': ' + message : ''}`);
}

function httpRequest(method: string, url: string, body?: string, timeoutMs = 5000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options: http.RequestOptions = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
    };
    const timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
    const req = http.request(options, (res) => {
      let resBody = '';
      res.on('data', (chunk: Buffer) => { resBody += chunk; });
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode ?? 0, body: resBody });
      });
    });
    req.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
    if (body) req.write(body);
    req.end();
  });
}

function httpGet(url: string, timeoutMs = 5000): Promise<{ status: number; body: string }> {
  return httpRequest('GET', url, undefined, timeoutMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('MJ Maps Production Integrity Check');
  console.log('='.repeat(60) + '\n');

  // ── 1. TypeScript compilation ─────────────────────────────────────────────
  console.log('1. TypeScript compilation:');
  try {
    execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'pipe' });
    log('tsc --noEmit', true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('tsc --noEmit', false, msg.substring(0, 200));
  }

  // ── 2. Build artifacts ────────────────────────────────────────────────────
  console.log('\n2. Build artifacts:');
  const requiredArtifacts = [
    'dist/services/api/server.js',
    'dist/services/db/migrations',
  ];
  for (const artifact of requiredArtifacts) {
    const full = path.join(ROOT, artifact);
    const exists = fs.existsSync(full);
    log(artifact, exists, exists ? undefined : 'MISSING');
  }

  const migrationsDir = path.join(ROOT, 'dist/services/db/migrations');
  if (fs.existsSync(migrationsDir)) {
    const count = fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql')).length;
    log(`migrations count (${count})`, count >= 18, count < 18 ? `expected >=18, got ${count}` : undefined);
  }

  // ── 3. Server boot + health check ─────────────────────────────────────────
  console.log('\n3. Server boot test (no DATABASE_URL):');

  const PORT = 19876;
  const serverProc = spawn(
    'node',
    ['dist/services/api/server.js'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'development',
        JWT_SECRET: 'integrity-check-secret',
        DATABASE_URL: '',
        POSTGRES_URL: '',
      },
      stdio: 'pipe',
    }
  );

  serverProc.stderr.on('data', (_d: Buffer) => { /* suppress */ });
  serverProc.stdout.on('data', (_d: Buffer) => { /* suppress */ });

  try {
    await sleep(3000);

    try {
      const health = await httpGet(`http://localhost:${PORT}/api/v1/health`);
      log('/api/v1/health → 200', health.status === 200, health.status !== 200 ? `got ${health.status}` : undefined);
    } catch (err) {
      log('/api/v1/health → 200', false, err instanceof Error ? err.message : String(err));
    }

    try {
      const ready = await httpGet(`http://localhost:${PORT}/api/v1/health/ready`);
      log('/api/v1/health/ready → 503 (no DB)', ready.status === 503, ready.status !== 503 ? `got ${ready.status}` : undefined);
    } catch (err) {
      log('/api/v1/health/ready → 503 (no DB)', false, err instanceof Error ? err.message : String(err));
    }

    try {
      // POST without auth token — must return 401 (route is wired, auth middleware is running)
      const optimise = await httpRequest('POST', `http://localhost:${PORT}/api/v1/routes/optimise`, '{}');
      log('POST /api/v1/routes/optimise → 401 (auth gated)', optimise.status === 401, `got ${optimise.status}`);
    } catch (err) {
      log('POST /api/v1/routes/optimise → 401', false, err instanceof Error ? err.message : String(err));
    }

  } finally {
    serverProc.kill('SIGTERM');
  }

  // ── 4. Summary ────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed > 0) {
    console.log('\nFailed:');
    results.filter(r => !r.passed).forEach(r => console.log(`  ❌ ${r.name}${r.message ? ': ' + r.message : ''}`));
    console.log('\nProduction deployment BLOCKED');
    process.exit(1);
  } else {
    console.log('\n✅ ALL CHECKS PASSED — ready for deployment');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Integrity check crashed:', err);
  process.exit(1);
});
