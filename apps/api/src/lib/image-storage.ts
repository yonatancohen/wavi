import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';

export const REPLY_IMAGES_BUCKET = 'reply-images';
const DEFAULT_SIGNED_URL_TTL_SEC = 3600;

function extensionForMimetype(mimetype: string): string {
  if (mimetype === 'image/jpeg') return 'jpg';
  if (mimetype === 'image/webp') return 'webp';
  return 'png';
}

export async function uploadReplyImage(groupId: string, buffer: Buffer, mimetype: string): Promise<string> {
  const path = `${groupId}/${randomUUID()}.${extensionForMimetype(mimetype)}`;

  const { error } = await db.storage.from(REPLY_IMAGES_BUCKET).upload(path, buffer, {
    contentType: mimetype,
    upsert: false,
  });

  if (error) throw new Error(`Failed to upload reply image: ${error.message}`);
  return path;
}

export async function getReplyImageSignedUrl(storagePath: string, expiresInSec = DEFAULT_SIGNED_URL_TTL_SEC): Promise<string> {
  const { data, error } = await db.storage.from(REPLY_IMAGES_BUCKET).createSignedUrl(storagePath, expiresInSec);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to sign reply image URL: ${error?.message ?? 'no URL returned'}`);
  }
  return data.signedUrl;
}

export async function resolveReplyImageUrls<T extends { image_url?: string | null }>(replies: T[]): Promise<T[]> {
  return Promise.all(
    replies.map(async (reply) => {
      if (!reply.image_url) return reply;
      try {
        const signedUrl = await getReplyImageSignedUrl(reply.image_url);
        return { ...reply, image_url: signedUrl };
      } catch (err) {
        console.warn('[image-storage] Failed to sign reply image URL:', err);
        return { ...reply, image_url: null };
      }
    }),
  );
}
