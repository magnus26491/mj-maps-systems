/**
 * services/storage/s3-client.ts
 * S3-compatible client for POD photo upload (works with AWS S3 and Cloudflare R2).
 */
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';


const BUCKET    = process.env.R2_BUCKET ?? '';
const ENDPOINT  = process.env.R2_ENDPOINT;
const CDN_BASE  = process.env.R2_PUBLIC_URL ?? '';
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID ?? '';
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';


export const s3Configured = Boolean(BUCKET && ACCESS_KEY && SECRET_KEY);


if (!s3Configured) {
  console.warn('[storage] R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set — POD upload disabled');
}


const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
  region: 'auto',
  credentials: {
    accessKeyId:     ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
};


if (ENDPOINT) {
  (clientConfig as Record<string, unknown>).endpoint = ENDPOINT;
  (clientConfig as Record<string, unknown>).forcePathStyle = true;
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


/**
 * Upload a POD photo directly to R2/S3.
 * Used by api/routes/pod.ts when the driver uploads a photo.
 *
 * @param driverId  - The driver's UUID
 * @param stopId    - The stop's UUID
 * @param buffer    - Raw file buffer (JPEG or PNG)
 * @param mimeType  - 'image/jpeg' or 'image/png'
 * @returns         - The public CDN URL of the uploaded object
 */
export async function uploadPod(
  driverId: string,
  stopId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const key = `pod/${driverId}/${stopId}-${Date.now()}.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          key,
    Body:         buffer,
    ContentType:  mimeType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return `${CDN_BASE}/${key}`;
}
