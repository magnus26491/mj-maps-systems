/**
 * Storage Presign Routes
 *
 * Endpoints:
 *   POST /api/v1/storage/presign — generate a presigned PUT URL for direct S3/R2 upload
 */

import type { FastifyInstance } from 'fastify';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuth } from '../middleware/auth.js';

// ── S3/R2 client (mirrors s3-client.ts config) ──────────────────────────────────

const BUCKET     = process.env.R2_BUCKET ?? '';
const ENDPOINT   = process.env.R2_ENDPOINT;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID ?? '';
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';

const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
  region: 'auto',
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
};
if (ENDPOINT) {
  (clientConfig as Record<string, unknown>).endpoint   = ENDPOINT;
  (clientConfig as Record<string, unknown>).forcePathStyle = true;
}
export const s3 = new S3Client(clientConfig);

// ── Allowed MIME types and filename pattern ──────────────────────────────────────

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const FILENAME_RE = /^[\w\-]+\.(jpg|jpeg|png|webp)$/i;

// ── Schema ─────────────────────────────────────────────────────────────────────

const PresignSchema = {
  type: 'object',
  properties: {
    fileName:    { type: 'string' },
    contentType: { type: 'string' },
    folder:      { type: 'string', enum: ['pod', 'profile'] },
  },
  required: ['fileName', 'contentType', 'folder'],
};

// ── Plugin ─────────────────────────────────────────────────────────────────────

export async function registerStoragePresignRoutes(server: FastifyInstance): Promise<void> {

  // ── POST /api/v1/storage/presign ─────────────────────────────────────────
  server.post<{
    Body: { fileName: string; contentType: string; folder: 'pod' | 'profile' };
  }>(
    '/api/v1/storage/presign',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const authUser = (request as any).authUser as AuthUser;
      const { fileName, contentType, folder } = request.body;

      // Validate content type
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        return reply.status(400).send({
          error: `Invalid contentType. Allowed: ${[...ALLOWED_CONTENT_TYPES].join(', ')}`,
        });
      }

      // Validate filename
      if (!FILENAME_RE.test(fileName)) {
        return reply.status(400).send({
          error: 'Invalid fileName. Must match: word characters or hyphens, .jpg/.jpeg/.png/.webp extension.',
        });
      }

      // Build object key
      const key = `${folder}/${authUser.sub}/${Date.now()}-${fileName}`;

      // Generate presigned PUT URL
      try {
        const command = new PutObjectCommand({
          Bucket:      BUCKET,
          Key:         key,
          ContentType: contentType,
        });
        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

        return reply.send({ uploadUrl, key, expiresIn: 300 });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        server.log.error({ err }, '[storage-presign] failed to generate presigned URL');
        return reply.status(500).send({ error: msg });
      }
    },
  );
}

interface AuthUser {
  sub: string;
}
