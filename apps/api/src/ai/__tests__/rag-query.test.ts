import { describe, expect, it } from 'bun:test';
import { isDeictic, normalizeRagQuery } from '../rag-query.js';

describe('isDeictic', () => {
  it('returns true for a short Hebrew who-question', () => {
    expect(isDeictic('מי זה?')).toBe(true);
  });

  it('returns true for a single Hebrew question word', () => {
    expect(isDeictic('מתי?')).toBe(true);
  });

  it('returns true for a short English where-question', () => {
    expect(isDeictic('where are we meeting?')).toBe(true);
  });

  it('returns false for a longer Hebrew statement', () => {
    expect(isDeictic('ספר לי על הטיול לאילת')).toBe(false);
  });

  it('returns false for a longer statement without question words', () => {
    expect(isDeictic('תספר לי קצת על מה שקרה בשישי בלילה כי לא הייתי')).toBe(false);
  });
});

describe('normalizeRagQuery', () => {
  it('strips agent tag and filler', () => {
    const q = normalizeRagQuery('@wavi מי זה Dan Cohen? וואו', []);
    expect(q).not.toContain('@wavi');
    expect(q).toContain('Dan Cohen');
  });

  it('prepends only 1 recent message for a deictic question', () => {
    const recent = [
      { sender_name: 'Bob', body: 'earlier msg' },
      { sender_name: 'Alice', body: 'talking about Dan' },
      { sender_name: 'Carol', body: 'last message here' },
    ];
    const q = normalizeRagQuery('@wavi who is he?', recent);
    // Only the last message should appear, not the earlier ones
    expect(q).toContain('Carol');
    expect(q).not.toContain('Bob');
    expect(q).toContain('who is he');
  });

  it('prepends up to 3 recent messages for a non-deictic message', () => {
    const recent = [
      { sender_name: 'Bob', body: 'first msg' },
      { sender_name: 'Alice', body: 'second msg' },
      { sender_name: 'Carol', body: 'third msg' },
    ];
    const q = normalizeRagQuery('@wavi ספר לי על הטיול לאילת שהיה בשבת', recent);
    expect(q).toContain('Bob');
    expect(q).toContain('Alice');
    expect(q).toContain('Carol');
    expect(q).toContain('הטיול לאילת');
  });

  it('prepends recent context when available (deictic, keeps last message)', () => {
    const q = normalizeRagQuery('@wavi who is he?', [
      { sender_name: 'Bob', body: 'earlier msg' },
      { sender_name: 'Alice', body: 'talking about Dan' },
    ]);
    expect(q).toContain('Alice');
    expect(q).toContain('who is he');
  });

  it('strips numeric mention tags', () => {
    const q = normalizeRagQuery('מה קרה @972501234567', []);
    expect(q).not.toMatch(/@\d+/);
    expect(q).toContain('מה קרה');
  });
});
