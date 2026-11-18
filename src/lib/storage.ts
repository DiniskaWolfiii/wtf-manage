import crypto from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const OWNED_AVATAR_KEY_REGEX = /^avatars\/[a-zA-Z0-9_-]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;

let cachedClient: S3Client | null = null;

interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
}

function getStorageConfig(): StorageConfig | null {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const publicUrl = process.env.S3_PUBLIC_URL?.trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicUrl) {
    return null;
  }

  return {
    endpoint,
    region: process.env.S3_REGION?.trim() || 'auto',
    bucket,
    accessKeyId,
    secretAccessKey,
    publicUrl: publicUrl.replace(/\/+$/, ''),
  };
}

/**
 * Check whether S3/R2 object storage environment variables are configured.
 */
export function isStorageConfigured(): boolean {
  return getStorageConfig() !== null;
}

function getS3Client(config: StorageConfig): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: false,
    });
  }
  return cachedClient;
}

/**
 * Upload an optimized WebP avatar buffer to S3/R2 and return its public URL.
 */
export async function uploadAvatarBuffer(userId: string, webpBuffer: Buffer): Promise<string> {
  const config = getStorageConfig();
  if (!config) {
    throw new Error('Object storage is not configured');
  }

  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeUserId) {
    throw new Error('Invalid user ID for avatar key');
  }

  const key = `avatars/${safeUserId}-${crypto.randomUUID()}.webp`;
  const client = getS3Client(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: webpBuffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  return `${config.publicUrl}/${key}`;
}

/**
 * Extract the object key if the given URL points to an owned avatar in our configured bucket.
 */
export function extractOwnedAvatarKey(avatarUrl?: string | null, expectedUserId?: string): string | null {
  if (!avatarUrl) {
    return null;
  }
  const config = getStorageConfig();
  if (!config) {
    return null;
  }

  const prefix = `${config.publicUrl}/`;
  if (!avatarUrl.startsWith(prefix)) {
    return null;
  }

  const key = avatarUrl.slice(prefix.length);
  if (!OWNED_AVATAR_KEY_REGEX.test(key)) {
    return null;
  }

  if (expectedUserId !== undefined) {
    const safeUserId = expectedUserId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeUserId || !key.startsWith(`avatars/${safeUserId}-`)) {
      return null;
    }
  }

  return key;
}

/**
 * Delete an owned avatar object from S3/R2 by its public URL.
 * Silently ignores URLs that do not belong to our configured R2 bucket/key pattern.
 */
export async function deleteAvatarByUrl(avatarUrl?: string | null, expectedUserId?: string): Promise<void> {
  const config = getStorageConfig();
  if (!config) {
    return;
  }

  const key = extractOwnedAvatarKey(avatarUrl, expectedUserId);
  if (!key) {
    return;
  }

  const client = getS3Client(config);
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    })
  );
}
