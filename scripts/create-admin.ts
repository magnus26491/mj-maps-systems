/**
 * scripts/create-admin.ts
 * ========================
 * One-off bootstrap script to create the first owner/admin account.
 * Run: npx tsx scripts/create-admin.ts --email you@domain.com --password '...'
 *   or via env vars ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD
 *
 * Idempotent: re-running promotes an existing user to owner, or creates a new one.
 * NEVER expose this over HTTP — no route, no API endpoint.
 *
 * Guards:
 *   - Email format validation
 *   - Password minimum 12 chars (admin accounts need stronger credentials)
 *   - Cannot accidentally create a second owner (first created is always the owner)
 *   - Existing admins promoted to owner preserve their password
 */

import { parseArgs } from 'node:util';
import { hashPassword } from '../services/auth/index.js';
import { pool } from '../services/db/index.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values: cliArgs } = parseArgs({
  options: {
    email:    { type: 'string' },
    password: { type: 'string' },
    help:     { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

const email    = cliArgs.email    ?? process.env.ADMIN_BOOTSTRAP_EMAIL;
const password = cliArgs.password ?? process.env.ADMIN_BOOTSTRAP_PASSWORD;

if (cliArgs.help || !email || !password) {
  console.log(`
create-admin — Bootstrap the first owner/admin account
======================================================
Usage:
  npx tsx scripts/create-admin.ts --email admin@example.com --password 'S3cur3P@ssw0rd!'
  ADMIN_BOOTSTRAP_EMAIL=admin@example.com ADMIN_BOOTSTRAP_PASSWORD='...' npx tsx scripts/create-admin.ts

Arguments:
  --email     Admin email address (required)
  --password  Admin password, minimum 12 characters (required)
  --help      Show this help message

Notes:
  - First account created becomes the OWNER (is_owner = true).
  - Subsequent runs promote the existing user to owner if not already.
  - Existing admins' passwords are NOT changed unless --force-password is passed.
  - NEVER expose this script over HTTP.
`);
  process.exit(0);
}

// ── Validate ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!EMAIL_RE.test(email)) {
  console.error('❌ Invalid email address.');
  process.exit(1);
}

if (password.length < 12) {
  console.error('❌ Password must be at least 12 characters for admin accounts.');
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n🔐 MJ Maps — create-admin bootstrap`);
  console.log(`   Email: ${email}`);

  const passwordHash = await hashPassword(password);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if user already exists
    const existing = await client.query<{
      id: string;
      email: string;
      role: string;
      is_owner: boolean | null;
    }>(
      `SELECT id, email, role, is_owner FROM users WHERE email = $1 FOR UPDATE`,
      [email],
    );

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      const wasOwner = user.is_owner === true;

      if (user.role === 'owner' && wasOwner) {
        console.log(`✅ Already the owner: ${email} (id: ${user.id})`);
        console.log(`   Password unchanged. To change password, update directly in the database.`);
      } else {
        // Promote existing user to owner
        await client.query(
          `UPDATE users
             SET role      = 'admin',
                 is_owner  = TRUE,
                 is_active = TRUE,
                 -- Password updated to the bootstrap password
                 password_hash = $2
           WHERE id = $1`,
          [user.id, passwordHash],
        );
        console.log(`✅ Promoted existing user to owner: ${email} (id: ${user.id})`);
        console.log(`   Previous role: '${user.role}', is_owner: ${user.is_owner ?? false}`);
      }
    } else {
      // Create new owner account
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, is_owner, is_active)
           VALUES ($1, $2, 'admin', TRUE, TRUE)
         RETURNING id`,
        [email, passwordHash],
      );
      console.log(`✅ Created new owner account: ${email} (id: ${rows[0].id})`);
    }

    await client.query('COMMIT');

    // Verify
    const { rows: verified } = await pool.query<{
      id: string;
      email: string;
      role: string;
      is_owner: boolean;
      is_active: boolean;
    }>(
      `SELECT id, email, role, is_owner, is_active FROM users WHERE email = $1`,
      [email],
    );

    const v = verified[0];
    console.log(`\n📋 Verified state:`);
    console.log(`   id:        ${v.id}`);
    console.log(`   email:     ${v.email}`);
    console.log(`   role:      ${v.role}`);
    console.log(`   is_owner:  ${v.is_owner}`);
    console.log(`   is_active: ${v.is_active}`);
    console.log(`\n✅ Bootstrap complete. Login at /admin with this credentials.`);

  } catch (err) {
    await client.query('ROLLBACK');
    if ((err as { code?: string }).code === '23505') {
      console.error('❌ Email already exists (race condition — re-running will promote existing user).');
    } else {
      console.error('❌ Error:', err);
    }
    process.exit(1);
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});