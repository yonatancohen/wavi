import { describe, expect, it } from 'bun:test';
import { DIGEST_MESSAGE_LIMIT, digestSince } from '../digest-window.js';

describe('digestSince', () => {
  const now = new Date('2026-08-21T07:00:00.000Z');

  it('uses the past 24 hours for a daily digest', () => {
    const since = digestSince(now, 'daily');
    expect(since.toISOString()).toBe('2026-08-20T07:00:00.000Z');
  });

  it('uses the past 7 days for a weekly digest', () => {
    const since = digestSince(now, 'weekly');
    expect(since.toISOString()).toBe('2026-08-14T07:00:00.000Z');
  });

  it('caps how many window messages go into the prompt', () => {
    expect(DIGEST_MESSAGE_LIMIT).toBe(200);
  });
});
