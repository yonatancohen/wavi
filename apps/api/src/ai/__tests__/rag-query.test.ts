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
  // ── Hebrew — explicit search commands ───────────────────────
  it('detects "תחפש בהיסטוריה"', () => expect(isRecallQuery('תחפש בהיסטוריה')).toBe(true));
  it('detects "ננסה לחפש"', () => expect(isRecallQuery('ננסה לחפש')).toBe(true));
  it('detects "בוא נחפש"', () => expect(isRecallQuery('בוא נחפש')).toBe(true));
  it('detects "תמצא לי"', () => expect(isRecallQuery('תמצא לי בהיסטוריה')).toBe(true));

  // ── Hebrew — "last time" phrases ────────────────────────────
  it('detects "בפעם האחרונה"', () => expect(isRecallQuery('בפעם האחרונה הלכנו לים')).toBe(true));
  it('detects "פעם אחרונה ש"', () => expect(isRecallQuery('פעם אחרונה שהיינו שם')).toBe(true));

  // ── Hebrew — past-tense "we did" verbs ──────────────────────
  it('detects "הלכנו"', () => expect(isRecallQuery('הלכנו למסעדה ביפו')).toBe(true));
  it('detects "נסענו"', () => expect(isRecallQuery('נסענו לצפון')).toBe(true));
  it('detects "טסנו"', () => expect(isRecallQuery('טסנו לאמסטרדם')).toBe(true));
  it('detects "היינו"', () => expect(isRecallQuery('היינו בחופשה')).toBe(true));
  it('detects "אכלנו"', () => expect(isRecallQuery('אכלנו שם פעם')).toBe(true));
  it('detects "נפגשנו"', () => expect(isRecallQuery('נפגשנו בקפה')).toBe(true));
  it('detects "חגגנו"', () => expect(isRecallQuery('חגגנו יום הולדת שם')).toBe(true));

  // ── Hebrew — remember/remind ─────────────────────────────────
  it('detects "תזכיר"', () => expect(isRecallQuery('תזכיר לי מתי הייתם בחו"ל')).toBe(true));
  it('detects "זוכר"', () => expect(isRecallQuery('זוכר מתי הלכנו לאילת?')).toBe(true));
  it('detects "זוכרים"', () => expect(isRecallQuery('זוכרים מתי זה היה?')).toBe(true));

  // ── Hebrew — "when was it" ───────────────────────────────────
  it('detects "מתי זה היה"', () => expect(isRecallQuery('מתי זה היה בדיוק?')).toBe(true));
  it('detects "מתי קרה"', () => expect(isRecallQuery('מתי קרה הדבר הזה')).toBe(true));

  // ── Hebrew — past event nouns ────────────────────────────────
  it('detects "הטיול ל"', () => expect(isRecallQuery('הטיול לאילת היה מתי?')).toBe(true));
  it('detects "החופשה ב"', () => expect(isRecallQuery('החופשה בתאילנד')).toBe(true));

  // ── English — explicit search commands ──────────────────────
  it('detects "search the history"', () => expect(isRecallQuery('search the history')).toBe(true));
  it('detects "look in the chat"', () => expect(isRecallQuery('look in the chat')).toBe(true));
  it('detects "check the messages"', () => expect(isRecallQuery('check the messages')).toBe(true));

  // ── English — "last time/year/summer" ───────────────────────
  it('detects "last time"', () => expect(isRecallQuery('remind me last time abroad')).toBe(true));
  it('detects "last summer"', () => expect(isRecallQuery('last summer we went to eilat')).toBe(true));
  it('detects "last year"', () => expect(isRecallQuery('last year trip')).toBe(true));
  it('detects "a few months ago"', () => expect(isRecallQuery('a few months ago we visited')).toBe(true));

  // ── English — recall verbs ───────────────────────────────────
  it('detects "remind me about"', () => expect(isRecallQuery('remind me about the trip')).toBe(true));
  it('detects "remember when"', () => expect(isRecallQuery('remember when we went')).toBe(true));
  it('detects "do you remember"', () => expect(isRecallQuery('do you remember when we ate there')).toBe(true));

  // ── English — "when did we" ──────────────────────────────────
  it('detects "when did we"', () => expect(isRecallQuery('when did we go to that restaurant')).toBe(true));
  it('detects "when were we"', () => expect(isRecallQuery('when were we in Eilat')).toBe(true));
  it('detects "when was the last"', () => expect(isRecallQuery('when was the last time')).toBe(true));

  // ── English — past "we did" phrases ─────────────────────────
  it('detects "went to restaurant"', () => expect(isRecallQuery('went to restaurant with the group')).toBe(true));
  it('detects "we visited"', () => expect(isRecallQuery('we visited that place last time')).toBe(true));
  it('detects "the trip to"', () => expect(isRecallQuery('the trip to Amsterdam')).toBe(true));
  it('detects "that time we"', () => expect(isRecallQuery('that time we all went')).toBe(true));
  it('detects "back when"', () => expect(isRecallQuery('back when we used to meet')).toBe(true));

  // ── Should NOT fire on regular chat ─────────────────────────
  it('does not match regular present-tense chat', () => expect(isRecallQuery('מה אתם עושים היום?')).toBe(false));
  it('does not match general knowledge questions', () => expect(isRecallQuery('מי זה ביבי?')).toBe(false));
  it('does not match future plans', () => expect(isRecallQuery('בוא נלך מחר לים')).toBe(false));
  it('does not match general opinion questions', () => expect(isRecallQuery('מה דעתך על פיצה?')).toBe(false));
  it('does not match casual English chat', () => expect(isRecallQuery('what do you think about this')).toBe(false));
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

  it('prepends up to 3 recent messages for a non-deictic, non-recall message', () => {
    const recent = [
      { sender_name: 'Bob', body: 'first msg' },
      { sender_name: 'Alice', body: 'second msg' },
      { sender_name: 'Carol', body: 'third msg' },
    ];
    // A present-tense opinion question — not a recall query, not deictic → full context window
    const q = normalizeRagQuery('@wavi מה דעתך על פיצה לארוחת ערב הלילה עם כולם', recent);
    expect(q).toContain('Bob');
    expect(q).toContain('Alice');
    expect(q).toContain('Carol');
    expect(q).toContain('פיצה');
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
