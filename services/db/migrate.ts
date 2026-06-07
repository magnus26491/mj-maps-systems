/**
 * services/db/migrate.ts — Idempotent SQL migration runner
 * ---------------------------------------------------
 * Reads all .sql files from services/db/migrations/, in filename order,
 * and applies any that have not yet been recorded in the _migrations table.
 *
 * CONVENTIONS for future migration files:
 *   - Name format: NNN_description.sql  (zero-padded, e.g. 001, 002)
 *   - Location:   services/db/migrations/
 *   - Be idempotent where possible — use IF NOT EXISTS, IF EXISTS, etc.
 *   - Never modify or delete previously applied migrations
 *   - Each migration runs in its own transaction (auto-rollback on error)
 *
 * USAGE:
 *   npm run migrate          — runs locally (set DATABASE_URL env var first)
 *   railway deploy hook       — runs automatically before API server starts
 *
 * EXIT CODES:
 *   0  — all migrations applied successfully (or already up-to-date)
 *   1  — error (bad env var, parse error, SQL error, etc.)
 */

import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { pool } from './index.js';

// ── Env guard ────────────────────────────────────────────────────────────────

const CONNECTION_STRING = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!CONNECTION_STRING) {
  console.error('ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

// ── Constants ────────────────────────────────────────────────────────────────
// MIGRATIONS_DIR resolves to where the .sql migration files live.
// The build step (npm run build) copies services/db/migrations/ into dist/,
// so the dist path always exists in production.  In local dev (ts-node without
// a prior build) dist/ may not exist, so we fall back to the source path.
//
// Production (Nixpacks, after npm run build):  distPath → dist/services/db/migrations ✅
// Local ts-node (no build run):                srcPath  → services/db/migrations     ✅
const MIGRATIONS_DIR = (() => {
  const distPath = join(process.cwd(), 'dist', 'services', 'db', 'migrations');
  const srcPath  = join(process.cwd(), 'services', 'db', 'migrations');
  return existsSync(distPath) ? distPath : srcPath;
})();

const CREATE_TRACKING_TABLE = `
CREATE TABLE IF NOT EXISTS _migrations (
  id         SERIAL PRIMARY KEY,
  filename   TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Ensure the _migrations tracking table exists.
 * Throws and exits on failure.
 */
async function ensureTrackingTable(): Promise<void> {
  try {
    await pool.query(CREATE_TRACKING_TABLE);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`FATAL: Could not create _migrations table: ${msg}`);
    process.exit(1);
  }
}

/**
 * Return the set of already-applied migration filenames.
 */
async function getAppliedMigrations(): Promise<Set<string>> {
  const { rows } = await pool.query<{ filename: string }>(
    'SELECT filename FROM _migrations ORDER BY id ASC',
  );
  return new Set(rows.map((r) => r.filename));
}

/**
 * Read and sort migration filenames from the migrations directory.
 * Filenames are sorted alphabetically so 001_ runs before 002_.
 */
async function getMigrationFiles(): Promise<string[]> {
  let files: string[];
  try {
    files = await readdir(MIGRATIONS_DIR);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`FATAL: Could not read migrations directory: ${MIGRATIONS_DIR}`);
    console.error(`  ${msg}`);
    process.exit(1);
  }
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Apply a single migration file inside a transaction.
 * Throws on failure (caller handles exit).
 */
async function applyMigration(filename: string): Promise<void> {
  let sql: string;
  try {
    sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read migration file "${filename}": ${msg}`);
  }

  if (!sql.trim()) {
    console.warn(`  Skipping empty file: ${filename}`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
      [filename],
    );
    await client.query('COMMIT');
    console.log(`  \u2713 Applied ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { /* swallow rollback error */ });
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`SQL error in "${filename}": ${msg}`);
  } finally {
    client.release();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n=== MJ Maps — Migration Runner ===\n');

  // 1. Ensure tracking table exists
  await ensureTrackingTable();

  // 2. Get already-applied migrations
  const applied = await getAppliedMigrations();

  // 3. Get all .sql files in the migrations directory
  const files = await getMigrationFiles();

  if (files.length === 0) {
    console.log('No migration files found.\n');
    return;
  }

  // 4. Apply each file that hasn't been applied yet
  let appliedCount = 0;
  let skippedCount  = 0;

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`  – Skipped ${filename} (already applied)`);
      skippedCount++;
    } else {
      try {
        await applyMigration(filename);
        appliedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n  ERROR: ${msg}`);
        console.error('  Rolling back — this migration failed and Railway will not start.\n');
        process.exit(1);
      }
    }
  }

  // 5. Summary
  console.log(`\n  Applied:  ${appliedCount}`);
  console.log(`  Skipped:  ${skippedCount}`);
  console.log('\n  All migrations complete.\n');

  // Safe to end pool here — migrate:prod and start run as separate OS processes
  // (joined by shell &&), so this pool instance is not shared with the API server.
  // This also ensures the standalone `node dist/db/migrate.js` exits cleanly.
  await pool.end();
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n  FATAL: Unexpected error: ${msg}\n`);
  process.exit(1);
});
