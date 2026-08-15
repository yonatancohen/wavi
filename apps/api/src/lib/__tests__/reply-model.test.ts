import { describe, expect, it } from 'bun:test';
import { DEFAULT_REPLY_MODEL, normalizeReplyModel } from '@wavi/shared';

describe('normalizeReplyModel', () => {
  it('keeps Haiku when that is the stored choice', () => {
    expect(normalizeReplyModel('claude-haiku-4-5')).toBe('claude-haiku-4-5');
  });

  it('maps Sonnet 5 and legacy Sonnet 4.6 to the current default', () => {
    expect(normalizeReplyModel('claude-sonnet-5')).toBe('claude-sonnet-5');
    expect(normalizeReplyModel('claude-sonnet-4-6')).toBe(DEFAULT_REPLY_MODEL);
    expect(DEFAULT_REPLY_MODEL).toBe('claude-sonnet-5');
  });

  it('defaults missing or unknown ids to Sonnet 5', () => {
    expect(normalizeReplyModel(undefined)).toBe('claude-sonnet-5');
    expect(normalizeReplyModel(null)).toBe('claude-sonnet-5');
    expect(normalizeReplyModel('claude-opus-4-6')).toBe('claude-sonnet-5');
  });
});
