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

  it('returns true for explicit search commands even without a question mark', () => {
    expect(shouldUseWebSearch('תבדוק באינטרנט בבקשה')).toBe(true);
    expect(shouldUseWebSearch('תחפש את זה בגוגל')).toBe(true);
    expect(shouldUseWebSearch('search for the latest news')).toBe(true);
    expect(shouldUseWebSearch('check the internet for me')).toBe(true);
    expect(shouldUseWebSearch('תגגל את זה')).toBe(true);
  });
});
