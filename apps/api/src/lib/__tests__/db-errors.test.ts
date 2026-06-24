import { describe, expect, it } from 'bun:test';
import { friendlyDbError } from '../db-errors.js';

describe('friendlyDbError', () => {
  it('explains missing image_generation_enabled column', () => {
    const msg = friendlyDbError({
      message: "Could not find the 'image_generation_enabled' column of 'groups' in the schema cache",
    });
    expect(msg).toContain('image_generation_enabled');
    expect(msg).toContain('ALTER TABLE groups');
  });

  it('explains missing image_url column', () => {
    const msg = friendlyDbError({
      message: "Could not find the 'image_url' column of 'replies' in the schema cache",
    });
    expect(msg).toContain('image_url');
    expect(msg).toContain('20250624_reply_image_url.sql');
  });

  it('explains agent/group mismatch', () => {
    const msg = friendlyDbError({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' });
    expect(msg).toContain('AGENT_ID');
  });

  it('passes through unknown errors', () => {
    expect(friendlyDbError({ message: 'connection refused' })).toBe('connection refused');
  });
});
