/**
 * services/storage/s3-client.ts
 * S3-compatible client for POD photo upload (works with AWS S3 and Cloudflare R2).
 */
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';


const BUCKET   = process.env.POD_S3_BUCKET   ?? '';
const REGION   = process.env.POD_S3_REGION   ?? 'auto';
const ENDPOINT = process.env.POD_S3_ENDPOINT;
const CDN_BASE = process.env.POD_CDN_BASE_URL ?? '';


export const s3Configured = Boolean(
  process.env.POD_S3_BUCKET &&
  process.env.POD_S3_ACCESS_KEY &&
  process.env.POD_S3_SECRET_KEY,
);


if (!s3Configured) {
  console.warn('[storage] POD_S3_BUCKET / POD_S3_ACCESS_KEY / POD_S3_SECRET_KEY not set — POD upload disabled');
}


const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
  region: REGION,
  credentials: {
    accessKeyId:     process.env.POD_S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.POD_S3_SECRET_KEY ?? '',
  },
};


if (ENDPOINT) {
  clientConfig.endpoint = ENDPOINT;
  clientConfig.forcePathStyle = true;
}


export const s3 = new S3Client(clientConfig);


/**
 * Generate a pre-signed PUT URL for a POD photo upload.
 * Object key format: pod/{stopId}/{timestamp}-{random}.jpg
 * Expires in 60 seconds.
 */
export async function generateUploadUrl(stopId: string): Promise<{
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
}> {
  const timestamp = Date.now();
  const random    = Math.random().toString(36).slice(2, 8);
  const objectKey = `pod/${stopId}/${timestamp}-${random}.jpg`;


  const command = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         objectKey,
    ContentType: 'image/jpeg',
  });


  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 });
  const expiresAt = new Date(Date.now() + 60_000).toISOString();


  return { uploadUrl, objectKey, expiresAt };
}


/**
 * Build the public CDN URL for a confirmed object key.
 * Validates that the key matches the expected pod/{stopId}/... format
 * before constructing the URL.
 */
export function buildPublicUrl(objectKey: string): string | null {
  if (!/^pod\/[\w-]+\/\d+-[a-z0-9]+\.jpg$/.test(objectKey)) return null;
  return `${CDN_BASE}/${objectKey}`;
}


/**
 * Verify an object exists in S3/R2 before writing the URL to the DB.
 * Returns true if the object exists, false otherwise.
 */
export async function verifyObjectExists(objectKey: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: objectKey }));
    return true;
  } catch {
    return false;
  }
}
