/**
 * POST /api/v1/auth/register
 * ---
 * Creates a new driver account with a free plan and 14-day trial.
 * Registers at /api/v1/auth/register in api/index.ts.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../../services/db';

export const authRegisterRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

authRegisterRouter.post('/', async (req: Request, res: Response) => {
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };

  // Step 1 — Validate
  const badFields: string[] = [];
  if (!name || typeof name !== 'string' || !name.trim()) badFields.push('name');
  if (!email || !EMAIL_RE.test(email)) badFields.push('email');
  if (!password || password.length < 8) badFields.push('password');

  if (badFields.length > 0) {
    res.status(400).json({ error: 'validation', fields: badFields });
    return;
  }

  const nameVal  = name.trim();
  const emailVal = email!.toLowerCase().trim();

  // Step 2 — Check email not taken
  const existing = await pool.query(
    `SELECT id FROM drivers WHERE LOWER(email) = LOWER($1)`,
    [emailVal],
  );
  if ((existing.rowCount ?? 0) > 0) {
    res.status(409).json({ error: 'email_taken' });
    return;
  }

  // Step 3 — Hash password
  const hash = await bcrypt.hash(password!, 12);

  // Step 4 — Insert driver with 14-day trial
  try {
    const result = await pool.query<{
      id: string;
      email: string;
      plan: string;
      trial_ends_at: Date;
    }>(
      `INSERT INTO drivers (name, email, password_hash, plan, trial_ends_at)
       VALUES ($1, $2, $3, 'free', NOW() + INTERVAL '14 days')
       RETURNING id, email, plan, trial_ends_at`,
      [nameVal, emailVal, hash],
    );

    const row = result.rows[0];
    res.status(201).json({
      ok: true,
      data: {
        driverId:    row.id,
        email:       row.email,
        plan:        row.plan,
        trialEndsAt: row.trial_ends_at.toISOString(),
      },
    });
  } catch (err) {
    if ((err as any).code === '23505') {
      res.status(409).json({ error: 'email_taken' });
      return;
    }
    console.error('[auth-register] insert failed:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});