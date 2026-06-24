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

  it('passes through unknown errors', () => {
    expect(friendlyDbError({ message: 'connection refused' })).toBe('connection refused');
  });
});
