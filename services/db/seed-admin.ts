/**
 * seed-admin — Create or update the initial admin user.
 *
 * Usage (Railway CLI):
 *   railway run --service <your-service> npx ts-node services/db/seed-admin.ts
 *
 * Required env vars:
 *   ADMIN_EMAIL     — email address for the admin account
 *   ADMIN_PASSWORD  — password (min 8 chars)
 *   DATABASE_URL    — postgres connection string (already set in Railway)
 */

import { getPool } from './index.js';
import { hashPassword } from '../auth/index.js';

const email    = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('[seed-admin] ADMIN_EMAIL and ADMIN_PASSWORD env vars are required.');
  process.exit(1);
}

if (password.length < 8) {
  console.error('[seed-admin] ADMIN_PASSWORD must be at least 8 characters.');
  process.exit(1);
}

(async () => {
  try {
    const hash = await hashPassword(password);
    const { rows } = await getPool().query(
      `INSERT INTO users (email, password_hash, role, plan_id, is_active)
       VALUES ($1, $2, 'admin', 'custom', true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role          = 'admin',
         plan_id       = 'custom',
         is_active     = true
       RETURNING id, email, role, plan_id`,
      [email, hash],
    );

    const user = rows[0];
    console.log(`[seed-admin] Admin user ready:`);
    console.log(`  id:      ${user.id}`);
    console.log(`  email:   ${user.email}`);
    console.log(`  role:    ${user.role}`);
    console.log(`  plan_id: ${user.plan_id}`);
    process.exit(0);
  } catch (err) {
    console.error('[seed-admin] Failed:', err);
    process.exit(1);
  }
})();
