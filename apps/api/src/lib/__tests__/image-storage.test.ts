import { describe, expect, it, beforeEach } from 'bun:test';
import { mockCreateSignedUrl, mockUpload } from '../../test-preload.js';

const { getReplyImageSignedUrl, resolveReplyImageUrls, REPLY_IMAGES_BUCKET } = await import('../image-storage.js');

describe('image-storage', () => {
  beforeEach(() => {
    mockCreateSignedUrl.mockClear();
    mockUpload.mockClear();
  });

  it('uses the reply-images bucket constant', () => {
    expect(REPLY_IMAGES_BUCKET).toBe('reply-images');
  });

  it('returns a signed URL for a storage path', async () => {
    const url = await getReplyImageSignedUrl('group-id/uuid.png');
    expect(url).toBe('https://example.com/signed.png');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('group-id/uuid.png', 3600);
  });

  it('transforms reply rows to signed image URLs', async () => {
    const rows = [{ id: '1', image_url: 'g1/a.png' }, { id: '2', image_url: null }, { id: '3' }];

    const resolved = await resolveReplyImageUrls(rows);
    expect(resolved[0]?.image_url).toBe('https://example.com/signed.png');
    expect(resolved[1]?.image_url).toBeNull();
    expect(resolved[2]?.image_url).toBeUndefined();
  });
});
