/**
 * POST /api/v1/stops/:stopId/pod/upload-url   — Step 1: get pre-signed URL
 * POST /api/v1/stops/:stopId/pod/confirm      — Step 3: confirm upload, write to DB
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  s3Configured,
  generateUploadUrl,
  buildPublicUrl,
  verifyObjectExists,
} from '../../storage/s3-client.js';
import {
  getStopForPod,
  setStopProofPhotoUrl,
  insertPodAuditRow,
} from '../../db/pod-store.js';


const StopIdParam = z.string().uuid('stopId must be a UUID');


export const podRoute: FastifyPluginAsync = async (fastify) => {


  // ── Step 1: Get pre-signed upload URL ────────────────────────────────────
  fastify.post<{ Params: { stopId: string } }>(
    '/api/v1/stops/:stopId/pod/upload-url',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!s3Configured) {
        return reply.code(503).send({ ok: false, error: 'Photo upload not available' });
      }

      const stopId = StopIdParam.safeParse(request.params.stopId);
      if (!stopId.success) {
        return reply.code(400).send({ ok: false, error: 'Invalid stopId' });
      }

      const stop = await getStopForPod(stopId.data);
      if (!stop) {
        return reply.code(404).send({ ok: false, error: 'Stop not found' });
      }

      try {
        const { uploadUrl, objectKey, expiresAt } = await generateUploadUrl(stopId.data);
        return reply.send({ ok: true, data: { uploadUrl, objectKey, expiresAt } });
      } catch (err) {
        request.log.error({ err }, '[pod] Failed to generate upload URL');
        return reply.code(500).send({ ok: false, error: 'Failed to generate upload URL' });
      }
    },
  );


  // ── Step 3: Confirm upload, write URL to DB ──────────────────────────────
  fastify.post<{ Params: { stopId: string }; Body: { objectKey: string } }>(
    '/api/v1/stops/:stopId/pod/confirm',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          properties: { objectKey: { type: 'string' } },
          required: ['objectKey'],
        },
      },
    },
    async (request, reply) => {
      if (!s3Configured) {
        return reply.code(503).send({ ok: false, error: 'Photo upload not available' });
      }

      const stopId = StopIdParam.safeParse(request.params.stopId);
      if (!stopId.success) {
        return reply.code(400).send({ ok: false, error: 'Invalid stopId' });
      }

      const body = z.object({ objectKey: z.string().min(1) }).safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ ok: false, error: 'objectKey required' });
      }

      const { objectKey } = body.data;
      const proofPhotoUrl = buildPublicUrl(objectKey);
      if (!proofPhotoUrl) {
        return reply.code(400).send({ ok: false, error: 'Invalid objectKey format' });
      }

      const stop = await getStopForPod(stopId.data);
      if (!stop) {
        return reply.code(404).send({ ok: false, error: 'Stop not found' });
      }

      const exists = await verifyObjectExists(objectKey);
      if (!exists) {
        return reply.code(422).send({
          ok: false,
          error: 'Photo not found in storage — upload may have failed or expired',
        });
      }

      try {
        await setStopProofPhotoUrl({ stopId: stopId.data, proofPhotoUrl });

        const userId = (request as any).authUser?.id ?? 'unknown';
        insertPodAuditRow({
          stopId: stopId.data,
          userId,
          objectKey,
          proofPhotoUrl,
        }).catch((auditErr) => {
          request.log.warn({ auditErr }, '[pod] Audit row insert failed (non-fatal)');
        });

        return reply.send({ ok: true, data: { proofPhotoUrl } });
      } catch (err) {
        request.log.error({ err }, '[pod] Failed to confirm POD upload');
        return reply.code(500).send({ ok: false, error: 'Internal server error' });
      }
    },
  );
};
