import { describe, expect, it } from 'bun:test';
import { isDeictic, isRecallQuery, normalizeRagQuery } from '../rag-query.js';

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

describe('isRecallQuery', () => {
  it('detects Hebrew "last time" pattern', () => {
    expect(isRecallQuery('בפעם האחרונה הלכנו לים')).toBe(true);
  });

  it('detects Hebrew "went" pattern', () => {
    expect(isRecallQuery('הלכנו למסעדה ביפו')).toBe(true);
  });

  it('detects Hebrew "flew" pattern', () => {
    expect(isRecallQuery('טסנו לאמסטרדם')).toBe(true);
  });

  it('detects Hebrew "remind me" pattern', () => {
    expect(isRecallQuery('תזכיר לי מתי הייתם בחו"ל')).toBe(true);
  });

  it('detects English "last time" pattern', () => {
    expect(isRecallQuery('remind me last time abroad')).toBe(true);
  });

  it('detects English "went to" pattern', () => {
    expect(isRecallQuery('went to restaurant with the group')).toBe(true);
  });

  it('does not match regular present-tense chat', () => {
    expect(isRecallQuery('מה אתם עושים היום?')).toBe(false);
  });

  it('does not match general knowledge questions', () => {
    expect(isRecallQuery('מי זה ביבי?')).toBe(false);
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

  it('does NOT prepend recent context for recall queries — avoids diluting the embedding', () => {
    const recent = [
      { sender_name: 'Bob', body: 'what are you doing tonight' },
      { sender_name: 'Alice', body: 'nothing special just chilling' },
    ];
    const q = normalizeRagQuery('@wavi remind me last time abroad', recent);
    // Recent messages about tonight's plans must not appear
    expect(q).not.toContain('tonight');
    expect(q).not.toContain('chilling');
    expect(q).toContain('last time abroad');
  });

  it('does NOT prepend recent context for Hebrew recall queries', () => {
    const recent = [
      { sender_name: 'דן', body: 'מה נשמע אחי' },
      { sender_name: 'יוני', body: 'בסדר גמור' },
    ];
    const q = normalizeRagQuery('@wavi הלכנו למסעדה שם בנמל', recent);
    expect(q).not.toContain('בסדר גמור');
    expect(q).toContain('מסעדה');
  });
});
