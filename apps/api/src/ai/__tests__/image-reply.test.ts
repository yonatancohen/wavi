import { describe, expect, it } from 'bun:test';
import { parseImageReply, formatImageMessageBody } from '../image-reply.js';

describe('parseImageReply', () => {
  it('parses structured image replies', () => {
    const parsed = parseImageReply('IMAGE_PROMPT: A cartoon cat wearing sunglasses\nCAPTION: here you go 😎');
    expect(parsed).toEqual({
      imagePrompt: 'A cartoon cat wearing sunglasses',
      caption: 'here you go 😎',
    });
  });

  it('allows empty captions', () => {
    const parsed = parseImageReply('IMAGE_PROMPT: sunset over tel aviv beach\nCAPTION:');
    expect(parsed).toEqual({
      imagePrompt: 'sunset over tel aviv beach',
      caption: '',
    });
  });

  it('returns null for normal text replies', () => {
    expect(parseImageReply('just a normal reply')).toBeNull();
    expect(parseImageReply('IMAGE_PROMPT:')).toBeNull();
  });
});

describe('formatImageMessageBody', () => {
  it('uses caption when present', () => {
    expect(formatImageMessageBody('look at this', 'prompt')).toBe('look at this');
  });

  it('falls back to a truncated prompt placeholder', () => {
    const longPrompt = 'x'.repeat(200);
    expect(formatImageMessageBody('', longPrompt)).toBe(`[image: ${'x'.repeat(120)}…]`);
  });
});
