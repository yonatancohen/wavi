import { describe, expect, it } from 'bun:test';
import { anthropicContentTypes, textFromAnthropicContent } from '../anthropic-text.js';

describe('textFromAnthropicContent', () => {
  it('returns empty for missing or non-text blocks', () => {
    expect(textFromAnthropicContent(undefined)).toBe('');
    expect(textFromAnthropicContent([])).toBe('');
    expect(textFromAnthropicContent([{ type: 'thinking', text: null }])).toBe('');
  });

  it('reads a single text block', () => {
    expect(textFromAnthropicContent([{ type: 'text', text: '  hey  ' }])).toBe('hey');
  });

  it('skips thinking and joins later text blocks', () => {
    expect(
      textFromAnthropicContent([
        { type: 'thinking', text: 'internal' },
        { type: 'text', text: 'שלום' },
        { type: 'text', text: 'מה נשמע' },
      ]),
    ).toBe('שלום\nמה נשמע');
  });

  it('summarizes block types for logs', () => {
    expect(anthropicContentTypes([{ type: 'thinking' }, { type: 'text' }])).toBe('thinking,text');
    expect(anthropicContentTypes(undefined)).toBe('none');
  });
});
