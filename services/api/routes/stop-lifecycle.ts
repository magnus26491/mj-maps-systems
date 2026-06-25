/**
 * Stop lifecycle endpoints — called by the offline sync queue when
 * connectivity returns, or live during online operation.
 *
 * POST /api/v1/stops/:stopId/complete   — mark a stop delivered
 * POST /api/v1/stops/:stopId/fail       — mark a stop as failed delivery
 * POST /api/v1/sync/flush               — bulk-accept offline event queue
 *
 * Stage 7: Offline-first. The driver app writes to SQLite (packages/offline-cache)
 * during offline operation; flushSyncQueue() calls these endpoints when signal
 * returns. All three endpoints are idempotent so retries are safe.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../../db/index.js';

// ── Body schemas ──────────────────────────────────────────────────────────────

const CompleteBodySchema = z.object({
  completedAt:  z.number().optional(),       // epoch ms from device
  podPhotoUri:  z.string().url().optional(),  // R2 URL from upload step
  podSigUri:    z.string().url().optional(),  // R2 URL for signature
  note:         z.string().max(500).optional(),
});

const FailBodySchema = z.object({
  reason:    z.string().max(500),
  failedAt:  z.number().optional(),
  note:      z.string().max(500).optional(),
});

// Offline queue item — matches the shape written by packages/offline-cache/index.ts
const SyncItemSchema = z.object({
  endpoint: z.string(),
  method:   z.enum(['POST', 'PUT', 'PATCH', 'DELETE']),
  body:     z.record(z.unknown()),
});

const SyncFlushSchema = z.object({
  items: z.array(SyncItemSchema).max(200),
});

// ── Route plugin ──────────────────────────────────────────────────────────────

export const stopLifecycleRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * POST /api/v1/stops/:stopId/complete
   * Marks a stop as completed + optionally records POD assets.
   */
  fastify.post<{
    Params: { stopId: string };
    Body: z.infer<typeof CompleteBodySchema>;
  }>(
    '/api/v1/stops/:stopId/complete',
    {
      preHandler: [requireAuth],
      schema: {
        params:  { type: 'object', properties: { stopId: { type: 'string' } }, required: ['stopId'] },
        body:    { type: 'object', properties: { completedAt: { type: 'number' }, podPhotoUri: { type: 'string' }, podSigUri: { type: 'string' }, note: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { stopId } = request.params;
      const parsed = CompleteBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });
      const { completedAt, podPhotoUri, podSigUri, note } = parsed.data;

      const completedAtTs = completedAt ? new Date(completedAt) : new Date();

      const { rowCount } = await pool.query(
        `UPDATE stops SET
           status       = 'completed',
           completed_at = COALESCE($1, NOW()),
           notes        = COALESCE($2, notes),
           updated_at   = NOW()
         WHERE id = $3 AND status != 'completed'`,
        [completedAtTs, note ?? null, stopId],
      );

      if ((rowCount ?? 0) === 0) {
        // Either already completed (idempotent) or not found — treat both as ok
      }

      // Record POD assets if provided
      if (podPhotoUri || podSigUri) {
        await pool.query(
          `INSERT INTO pod_uploads (stop_id, photo_url, sig_url, uploaded_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (stop_id) DO UPDATE SET
             photo_url   = COALESCE(EXCLUDED.photo_url, pod_uploads.photo_url),
             sig_url     = COALESCE(EXCLUDED.sig_url, pod_uploads.sig_url),
             uploaded_at = NOW()`,
          [stopId, podPhotoUri ?? null, podSigUri ?? null],
        ).catch(() => {/* pod_uploads table may not exist in all envs */});
      }

      return reply.send({ ok: true });
    },
  );

  /**
   * POST /api/v1/stops/:stopId/fail
   * Marks a stop as a failed delivery with a reason.
   */
  fastify.post<{
    Params: { stopId: string };
    Body: z.infer<typeof FailBodySchema>;
  }>(
    '/api/v1/stops/:stopId/fail',
    {
      preHandler: [requireAuth],
      schema: {
        params: { type: 'object', properties: { stopId: { type: 'string' } }, required: ['stopId'] },
        body:   { type: 'object', properties: { reason: { type: 'string' }, failedAt: { type: 'number' }, note: { type: 'string' } }, required: ['reason'] },
      },
    },
    async (request, reply) => {
      const { stopId } = request.params;
      const parsed = FailBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });
      const { reason, failedAt, note } = parsed.data;

      const failedAtTs = failedAt ? new Date(failedAt) : new Date();

      await pool.query(
        `UPDATE stops SET
           status       = 'failed',
           fail_reason  = $1,
           completed_at = $2,
           notes        = COALESCE($3, notes),
           updated_at   = NOW()
         WHERE id = $4 AND status != 'failed'`,
        [reason, failedAtTs, note ?? null, stopId],
      );

      // Write to failed_deliveries if table exists
      await pool.query(
        `INSERT INTO failed_deliveries (stop_id, reason, failed_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [stopId, reason, failedAtTs],
      ).catch(() => {/* table may not exist */});

      return reply.send({ ok: true });
    },
  );

  /**
   * POST /api/v1/sync/flush
   * Accepts a batch of offline queue items and applies them.
   * Called by flushSyncQueue() in packages/offline-cache/index.ts.
   */
  fastify.post<{ Body: z.infer<typeof SyncFlushSchema> }>(
    '/api/v1/sync/flush',
    {
      preHandler: [requireAuth],
      schema: {
        body: { type: 'object', properties: { items: { type: 'array' } }, required: ['items'] },
      },
    },
    async (request, reply) => {
      const parsed = SyncFlushSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });

      const { items } = parsed.data;
      const driverId = (request as any).user?.id ?? null;
      const results: { endpoint: string; ok: boolean; error?: string }[] = [];

      for (const item of items) {
        try {
          // Route sync items to the correct handler
          const url = item.endpoint;
          const body = item.body;

          if (/\/stops\/(.+)\/complete/.test(url)) {
            const stopId = url.match(/\/stops\/(.+)\/complete/)?.[1];
            if (stopId) {
              await pool.query(
                `UPDATE stops SET status='completed', completed_at=COALESCE($1, NOW()), updated_at=NOW()
                 WHERE id=$2 AND status != 'completed'`,
                [(body.completedAt ? new Date(body.completedAt as number) : null), stopId],
              );
            }
            results.push({ endpoint: url, ok: true });
          } else if (/\/stops\/(.+)\/fail/.test(url)) {
            const stopId = url.match(/\/stops\/(.+)\/fail/)?.[1];
            if (stopId) {
              await pool.query(
                `UPDATE stops SET status='failed', fail_reason=$1, completed_at=COALESCE($2, NOW()), updated_at=NOW()
                 WHERE id=$3 AND status != 'failed'`,
                [body.reason ?? 'unknown', (body.failedAt ? new Date(body.failedAt as number) : null), stopId],
              );
            }
            results.push({ endpoint: url, ok: true });
          } else if (/\/location/.test(url)) {
            // Location pings — write to driver_locations if driver known
            if (driverId && body.lat && body.lng) {
              await pool.query(
                `INSERT INTO driver_locations (driver_id, route_id, lat, lng, heading, speed_kmh, recorded_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
                [driverId, body.routeId ?? null, body.lat, body.lng,
                 body.heading ?? null, body.speedKmh ?? null,
                 body.recordedAt ? new Date(body.recordedAt as string) : new Date()],
              );
            }
            results.push({ endpoint: url, ok: true });
          } else {
            results.push({ endpoint: url, ok: false, error: 'Unknown endpoint' });
          }
        } catch (err) {
          results.push({ endpoint: item.endpoint, ok: false, error: (err as Error).message });
        }
      }

      const succeeded = results.filter(r => r.ok).length;
      const failed    = results.filter(r => !r.ok).length;

      return reply.send({ ok: true, data: { total: items.length, succeeded, failed, results } });
    },
  );
};
