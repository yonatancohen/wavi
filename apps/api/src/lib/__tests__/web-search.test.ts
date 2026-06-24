import { describe, expect, it } from 'bun:test';
import { normalizeWebSearchQuery, shouldUseWebSearch } from '../web-search.js';

describe('normalizeWebSearchQuery', () => {
  it('strips agent tag and collapses whitespace', () => {
    expect(normalizeWebSearchQuery('@wavi   what is the weather?')).toBe('what is the weather?');
  });
});

describe('shouldUseWebSearch', () => {
  it('returns true for factual questions', () => {
    expect(shouldUseWebSearch('@wavi what is the weather in Tel Aviv today?')).toBe(true);
    expect(shouldUseWebSearch('מי ניצח במשחק אתמול?')).toBe(true);
  });

  it('returns false for memory and banter commands', () => {
    expect(shouldUseWebSearch('remember Dan owes me 20')).toBe(false);
    expect(shouldUseWebSearch('roast Dan')).toBe(false);
    expect(shouldUseWebSearch('summarize the chat')).toBe(false);
    expect(shouldUseWebSearch('thanks!')).toBe(false);
  });

  it('returns false for very short messages', () => {
    expect(shouldUseWebSearch('lol ok')).toBe(false);
  });
});
