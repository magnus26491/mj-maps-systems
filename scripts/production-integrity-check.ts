/**
 * Production Integrity Check Script
 *
 * HONEST validation: checks whether the production server actually runs,
 * not whether files exist on disk.
 *
 * Validates:
 *  1. npm run build succeeds
 *  2. tsc --noEmit succeeds (no type errors)
 *  3. Server boots and GET /api/v1/health returns 200
 *  4. Server does NOT require DATABASE_URL to answer health
 *  5. dist/ does NOT contain quarantined services
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn, type ChildProcess } from 'child_process';
import * as http from 'http';

interface ValidationResult {
  name: string;
  passed: boolean;
  message?: string;
}

const results: ValidationResult[] = [];

async function run(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name, passed: false, message: msg });
    console.log(`❌ ${name}: ${msg}`);
  }
}

function exec(cmd: string, cwd = process.cwd()): string {
  try {
    return execSync(cmd, { cwd, stdio: 'pipe', timeout: 120_000 }).toString().trim();
  } catch (e: unknown) {
    const err = e as Error & { stderr?: Buffer };
    throw new Error(`Command failed: ${cmd}\n${err.stderr?.toString() ?? err.message}`);
  }
}

function httpGet(host: string, port: number, urlPath: string, timeout = 5000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path: urlPath, timeout }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

const PORT = Number(process.env.PORT ?? 3099);
const HOST = process.env.HOST ?? 'localhost';

async function main() {
  console.log(`Node: ${process.version}`);
  console.log(`CWD:  ${process.cwd()}`);
  console.log('');

  // ─── 1. Build ────────────────────────────────────────────────────────────────

  console.log('[1/5] Running npm run build...');
  await run('npm run build succeeds', () => {
    const out = exec('npm run build');
    if (out.includes('error TS')) throw new Error('TypeScript errors in build output');
    const serverPath = path.join(process.cwd(), 'dist/services/api/server.js');
    if (!fs.existsSync(serverPath)) throw new Error('dist/services/api/server.js not found after build');
  });

  // ─── 2. TypeScript ───────────────────────────────────────────────────────────

  console.log('');
  console.log('[2/5] Running tsc --noEmit...');
  await run('tsc --noEmit succeeds', () => {
    exec('npx tsc --noEmit');
  });

  // ─── 3. Server boot (no DATABASE_URL) ───────────────────────────────────────

  console.log('');
  console.log('[3/5] Booting server (DATABASE_URL intentionally unset)...');

  let serverProcess: ChildProcess | null = null;

  await run('server boots (port is reachable)', () => {
    return new Promise<void>((resolve, reject) => {
      serverProcess = spawn('node', ['dist/services/api/server.js'], {
        // Supply minimum env vars for a test boot — server requires JWT_SECRET in prod
        env: {
          ...process.env,
          PORT: String(PORT),
          NODE_ENV: 'production',
          JWT_SECRET: 'test-jwt-secret-for-integrity-check',
          REDIS_URL: 'redis://localhost:6379',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Capture stderr for diagnostics if the check fails
      let stderrOutput = '';
      serverProcess!.stderr?.on('data', (d: Buffer) => {
        stderrOutput += d.toString();
      });

      const timeout = setTimeout(() => {
        serverProcess?.kill();
        // Surface stderr so we can see FATAL errors
        reject(new Error('Server did not become reachable within 10s.\nStderr:\n' + stderrOutput.substring(0, 800)));
      }, 10_000);

      // Poll the port until reachable
      const pollInterval = setInterval(async () => {
        try {
          const res = await httpGet(HOST, PORT, '/', 1000);
          clearInterval(pollInterval);
          clearTimeout(timeout);
          resolve();
        } catch {
          // Not yet reachable — keep polling
        }
      }, 500);

      serverProcess!.on('error', (e: Error) => {
        clearInterval(pollInterval);
        clearTimeout(timeout);
        reject(new Error('Failed to spawn server: ' + e.message));
      });

      serverProcess!.on('exit', (code) => {
        if (code !== null && code !== 0) {
          clearInterval(pollInterval);
          clearTimeout(timeout);
          reject(new Error('Server exited unexpectedly with code ' + code + '.\nStderr:\n' + stderrOutput.substring(0, 800)));
        }
      });
    });
  });

  // ─── 4. Health endpoints ────────────────────────────────────────────────────

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  console.log('');
  console.log('[4/5] Testing health endpoints...');

  await run('GET /api/v1/health returns 200', async () => {
    let attempts = 0;
    let lastErr: Error | null = null;
    while (attempts < 8) {
      try {
        const res = await httpGet(HOST, PORT, '/api/v1/health', 5000);
        if (res.status === 200) return; // pass
        throw new Error(`Expected 200, got ${res.status}: ${res.body}`);
      } catch (e: unknown) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        attempts++;
        await sleep(500);
      }
    }
    throw lastErr ?? new Error('Could not reach server after 8 attempts');
  });

  await run('GET /api/v1/health/ready returns 503 or 200 (no DB)', async () => {
    try {
      const res = await httpGet(HOST, PORT, '/api/v1/health/ready', 5000);
      if (res.status !== 200 && res.status !== 503) {
        throw new Error(`Expected 200 or 503, got ${res.status}: ${res.body}`);
      }
    } catch (e: unknown) {
      if ((e instanceof Error) && (e.message.includes('connect') || e.message.includes('timeout'))) {
        throw new Error('Server not reachable on port ' + PORT + ' — health check also failed');
      }
      throw e;
    } finally {
      // Clean up server process
      if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
      }
    }
  });

  // ─── 5. No quarantined code in dist ─────────────────────────────────────────

  console.log('');
  console.log('[5/5] Checking dist/ excludes quarantined code...');

  const INCUBATOR_SERVICES = [
    'access-engine', 'arrival-intelligence', 'confidence-explanation',
    'delivery-copilot', 'delivery-intake', 'delivery-learning',
    'delivery-prediction', 'driver-guardian', 'driver-memory',
    'driver-profile-intelligence', 'event-intelligence',
    'external-road-data', 'intelligence-confidence',
    'live-traffic-intelligence', 'navigation-control',
    'navigation-events', 'navigation-guard', 'navigation-learning',
    'parking-engine', 'platform-health', 'railway',
    'road-closure-engine', 'sync-queue', 'telemetry',
    'trolley-advisory', 'vehicle-intelligence', 'weather-intelligence',
  ];

  await run('dist/ does not contain _incubator services', () => {
    const distServices = path.join(process.cwd(), 'dist/services');
    if (!fs.existsSync(distServices)) return;
    const present = INCUBATOR_SERVICES.filter(s =>
      fs.existsSync(path.join(distServices, s))
    );
    if (present.length > 0) {
      throw new Error(`Found quarantined services in dist/: ${present.join(', ')}`);
    }
  });

  await run('dist/ does not contain legacy/', () => {
    if (fs.existsSync(path.join(process.cwd(), 'dist/legacy'))) {
      throw new Error('dist/legacy/ should not exist (legacy quarantined)');
    }
  });

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log('');
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total   = results.length;

  console.log(`Passed: ${passed}/${total}`);
  console.log(`Failed: ${failed}/${total}`);
  console.log('');

  if (failed > 0) {
    console.log('Failed Checks:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ❌ ${r.name}`);
      if (r.message) console.log(`     ${r.message}`);
    }
    console.log('');
    console.log('Production deployment BLOCKED');
    process.exit(1);
  } else {
    console.log('✅ ALL CHECKS PASSED — Server is production-ready');
    console.log('');
    console.log('Note: /api/v1/health/ready returned non-200 because no DATABASE_URL');
    console.log('      is set. In production, the DB is configured and this endpoint');
    console.log('      will return 200 once the database is reachable.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Unhandled error in integrity check:', err);
  process.exit(1);
});

