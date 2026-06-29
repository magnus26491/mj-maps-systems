/**
 * Billing Routes — Fastify Plugin
 * Mounted on /api/v1/billing
 *
 * Endpoints:
 *   POST /checkout  — create Stripe Checkout session
 *   POST /webhook   — Stripe webhook receiver (no auth)
 *   GET  /status    — get current subscription status
 *   POST /portal    — open Stripe Billing Portal session
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../../db/index';
import {
  stripe,
  createCheckoutSession,
  constructWebhookEvent,
  getSubscriptionStatus,
  type SubscriptionTier,
} from '../../billing/stripe';
import { sendPlatformAlert } from '../../notifications/telegram-alerts';
import { requireAuth } from '../middleware/auth';

// ── Tier map (mirrors stripe.ts getSubscriptionStatus) ─────────────────────────

const tierMap: Record<string, SubscriptionTier> = {
  [process.env.STRIPE_PRICE_COURIER    ?? 'price_courier']:    'courier',
  [process.env.STRIPE_PRICE_FLEET      ?? 'price_fleet']:      'fleet',
  [process.env.STRIPE_PRICE_ENTERPRISE ?? 'price_enterprise']: 'enterprise',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

interface AuthUser {
  sub: string;
  email: string;
  stripeCustomerId?: string | null;
}

// ── Plugin ─────────────────────────────────────────────────────────────────────

export async function registerBillingRoutes(server: FastifyInstance): Promise<void> {

  // ── POST /api/v1/billing/checkout ─────────────────────────────────────────
  // Body fields are all optional — server falls back to env vars so the mobile
  // app can call this without needing to know the Stripe price ID.
  server.post<{
    Body: { priceId?: string; successUrl?: string; cancelUrl?: string };
  }>(
    '/api/v1/billing/checkout',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const authUser = (request as any).authUser as AuthUser;
      const appUrl = process.env.APP_URL ?? 'mjmaps://';
      const priceId    = request.body?.priceId    ?? process.env.STRIPE_PRO_PRICE_ID;
      const successUrl = request.body?.successUrl ?? `${appUrl}billing/success`;
      const cancelUrl  = request.body?.cancelUrl  ?? `${appUrl}billing/cancel`;

      if (!stripe) {
        return reply.status(503).send({ error: 'Stripe is not configured.' });
      }
      if (!priceId) {
        return reply.status(503).send({ error: 'STRIPE_PRO_PRICE_ID is not configured.' });
      }

      try {
        const result = await createCheckoutSession({
          driverId:  authUser.sub,
          email:     authUser.email,
          priceId,
          successUrl,
          cancelUrl,
        });
        return reply.send({ url: result.url });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        server.log.error({ err }, '[billing] checkout session failed');
        return reply.status(500).send({ error: msg });
      }
    },
  );


  // ── POST /api/v1/billing/webhook ────────────────────────────────────────────
  // NOTE: The raw body parser is set globally in server.ts before routes load.
  // Stripe requires the unparsed body for HMAC signature verification.
  server.post('/api/v1/billing/webhook', async (request, reply) => {
    const signature = request.headers['stripe-signature'] as string | undefined;
    const rawBody   = (request as any).rawBody as Buffer | undefined;

    if (!rawBody || !signature) {
      return reply.code(400).send({ error: 'Missing rawBody or stripe-signature header.' });
    }

    let event: ReturnType<typeof constructWebhookEvent>;
    try {
      event = constructWebhookEvent(rawBody, signature);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Webhook signature verification failed';
      server.log.error({ err }, '[billing] webhook signature failed');
      return reply.code(400).send({ error: msg });
    }

    try {
      switch (event.type) {

        case 'checkout.session.completed': {
          const session = event.data.object as {
            customer?: string;
            subscription?: string;
            metadata?: { driverId?: string };
          };
          const driverId          = session.metadata?.driverId ?? '';
          const stripeCustomerId  = session.customer ?? '';
          const stripeSubId       = session.subscription ?? '';

          if (driverId && stripeCustomerId) {
            let tier: SubscriptionTier = 'courier';
            try {
              if (stripe && stripeSubId) {
                const sub = await stripe.subscriptions.retrieve(stripeSubId) as {
                  items: { data: { price: { id: string } }[] };
                };
                const priceId = sub.items.data[0]?.price.id ?? '';
                tier = tierMap[priceId] ?? 'courier';
              }
            } catch (subErr) {
              server.log.warn({ err: subErr }, '[billing] could not retrieve subscription for tier');
            }

            await pool.query(
              `UPDATE drivers
                 SET stripe_customer_id = $1,
                     stripe_subscription_id = $2,
                     subscription_tier = $3,
                     subscription_active = TRUE,
                     plan = $3
               WHERE id = $4`,
              [stripeCustomerId, stripeSubId, tier, driverId],
            );
            server.log.info({ driverId, tier }, '[billing] checkout completed — driver subscribed');
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as { customer?: string };
          if (sub.customer) {
            await pool.query(
              `UPDATE drivers
                 SET subscription_tier   = 'free',
                     subscription_active = FALSE,
                     plan                = 'free'
               WHERE stripe_customer_id = $1`,
              [sub.customer],
            );
            server.log.info({ customer: sub.customer }, '[billing] subscription deleted');
          }
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object as {
            customer?: string;
            status?: string;
            cancel_at_period_end?: boolean;
            items?: { data: { price: { id: string } }[] };
          };
          if (sub.customer) {
            try {
              const status = await getSubscriptionStatus(sub.customer);
              await pool.query(
                `UPDATE drivers
                   SET subscription_tier   = $1,
                       subscription_active = $2,
                       plan                = $1
                 WHERE stripe_customer_id = $3`,
                [status.tier, status.active, sub.customer],
              );
              server.log.info({ customer: sub.customer, tier: status.tier }, '[billing] subscription updated');
            } catch (err: unknown) {
              server.log.warn({ err }, '[billing] could not update subscription');
            }
          }
          break;
        }

        default:
          server.log.debug({ type: event.type }, '[billing] unhandled webhook event');
          break;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      server.log.error({ err }, '[billing] webhook processing error');
      sendPlatformAlert({
        level:   'WARN',
        service: 'stripe',
        message: `Webhook processing failed: ${msg}`,
      }).catch(() => {});
    }

    return reply.code(200).send({ received: true });
  });


  // ── GET /api/v1/billing/status ─────────────────────────────────────────────
  server.get('/api/v1/billing/status', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = (request as any).authUser as AuthUser;

    if (!authUser.stripeCustomerId) {
      return reply.send({
        tier:              'free',
        active:            false,
        currentPeriodEnd:  null,
        cancelAtPeriodEnd: false,
      });
    }

    try {
      const status = await getSubscriptionStatus(authUser.stripeCustomerId);
      return reply.send(status);
    } catch (err: unknown) {
      server.log.error({ err }, '[billing] getSubscriptionStatus failed');
      return reply.status(500).send({ error: 'Failed to retrieve subscription status.' });
    }
  });


  // ── POST /api/v1/billing/portal ─────────────────────────────────────────────
  server.post('/api/v1/billing/portal', { preHandler: [requireAuth] }, async (request, reply) => {
    const authUser = (request as any).authUser as AuthUser;

    if (!authUser.stripeCustomerId) {
      return reply.status(400).send({ error: 'No billing account found. Please subscribe first.' });
    }

    if (!stripe) {
      return reply.status(503).send({ error: 'Stripe is not configured.' });
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer:   authUser.stripeCustomerId,
        return_url: 'https://mjmapsystems.com/account',
      });
      return reply.send({ url: session.url });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      server.log.error({ err }, '[billing] portal session failed');
      return reply.status(500).send({ error: msg });
    }
  });
};
