/**
 * Billing Routes — Stripe Checkout + Webhooks
 * POST   /api/v1/billing/checkout  — create Stripe Checkout session (auth required)
 * GET    /api/v1/billing/status   — get driver's plan status (auth required)
 * POST   /api/v1/billing/webhook  — Stripe webhook handler (NO auth — uses sig verify)
 */

import express from 'express';
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { pool } from '../../services/db';
import { authenticateDriver } from '../middleware/authenticate';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2025-03-31.basil' as any,
});
const PRO_PRICE_ID  = process.env.STRIPE_PRO_PRICE_ID ?? '';
const WEBHOOK_SEC   = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const APP_SCHEME    = process.env.APP_URL ?? 'mjmaps://';

export const billingRouter = Router();

// ── Raw body capture for webhook signature verification ────────────────────────
// Store rawBody on the request object during parsing
function getRawBody(req: Request): Buffer | undefined {
  return (req as any).rawBody;
}

// ── POST /api/v1/billing/checkout ─────────────────────────────────────────────
billingRouter.post('/checkout', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = req.driver!.id;

    // Get or create Stripe customer
    const driverRows = await pool.query<{ stripe_customer_id: string | null }>(
      `SELECT stripe_customer_id FROM drivers WHERE id = $1`,
      [driverId],
    );
    const driverRow = driverRows.rows[0];
    let customerId = driverRow?.stripe_customer_id;

    if (!customerId) {
      const driverInfo = await pool.query<{ email: string; name: string }>(
        `SELECT email, name FROM drivers WHERE id = $1`,
        [driverId],
      );
      const info = driverInfo.rows[0];
      const customer = await stripe.customers.create({
        email: info?.email,
        name:  info?.name,
        metadata: { driverId },
      });
      customerId = customer.id;
      await pool.query(
        `UPDATE drivers SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, driverId],
      );
    }

    if (!PRO_PRICE_ID) {
      res.status(500).json({ error: 'Stripe price ID not configured' });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      mode:      'subscription',
      customer:  customerId,
      success_url: `${APP_SCHEME}billing/success`,
      cancel_url:  `${APP_SCHEME}billing/cancel`,
      line_items:  [{ price: PRO_PRICE_ID, quantity: 1 }],
      metadata:   { driverId },
      subscription_data: {
        trial_period_days: 14,
      },
    } as Parameters<typeof stripe.checkout.sessions.create>[0]);

    res.json({ ok: true, data: { checkoutUrl: session.url } });
  } catch (err) {
    console.error('[billing] checkout error:', err);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
});

// ── GET /api/v1/billing/status ────────────────────────────────────────────────
billingRouter.get('/status', authenticateDriver, async (req: Request, res: Response) => {
  try {
    const driverId = req.driver!.id;
    const rows = await pool.query<{
      plan: string;
      trial_ends_at: Date | null;
      plan_expires_at: Date | null;
    }>(
      `SELECT plan, trial_ends_at, plan_expires_at FROM drivers WHERE id = $1`,
      [driverId],
    );
    const row = rows.rows[0];
    res.json({
      ok: true,
      data: {
        plan:         row?.plan ?? 'free',
        trialEndsAt:  row?.trial_ends_at?.toISOString() ?? null,
        planExpiresAt: row?.plan_expires_at?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error('[billing] status error:', err);
    res.status(500).json({ error: 'Could not fetch billing status' });
  }
});

// ── POST /api/v1/billing/webhook ──────────────────────────────────────────────
// Use Express json parser but capture raw body for Stripe sig verification
billingRouter.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    const rawBody = req.body as Buffer;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SEC);
    } catch (err) {
      console.error('[billing] webhook sig error:', err);
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const driverId = session.metadata?.driverId;
          if (driverId) {
            await pool.query(
              `UPDATE drivers SET plan = 'pro', stripe_sub_id = $1 WHERE id = $2`,
              [session.subscription, driverId],
            );
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          await pool.query(
            `UPDATE drivers SET plan = 'free', stripe_sub_id = NULL WHERE stripe_sub_id = $1`,
            [sub.id],
          );
          break;
        }
        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const newPlan = ['active', 'trialing'].includes(sub.status) ? 'pro' : 'free';
          await pool.query(
            `UPDATE drivers SET plan = $1 WHERE stripe_sub_id = $2`,
            [newPlan, sub.id],
          );
          break;
        }
        default:
          // Ignore unhandled event types
          break;
      }
    } catch (err) {
      console.error('[billing] webhook handler error:', err);
    }

    res.json({ received: true });
  },
);