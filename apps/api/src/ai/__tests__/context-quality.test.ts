import { describe, expect, it } from 'bun:test';
import { isMetaGroupContext, isThinEpisodeSummary, usableGroupContext } from '../context-quality.js';

describe('isMetaGroupContext', () => {
  it('rejects English operator complaints', () => {
    expect(isMetaGroupContext("I can't write a useful block because I have nothing.")).toBe(true);
    expect(isMetaGroupContext("Empty Group. You didn't pass me the actual messages.")).toBe(true);
    expect(isMetaGroupContext('If you want me to write messages that fit, I need real chat.')).toBe(true);
  });

  it('rejects Hebrew operator complaints', () => {
    expect(isMetaGroupContext('אני צריך להיות ישיר לגבי context — אני לא יכול לכתוב block שימושי כי אין לי כלום.')).toBe(true);
    expect(isMetaGroupContext('קבוצה ריקה. אין הודעות אמיתיות, לא העברת לי את ההודעות.')).toBe(true);
  });

  it('keeps a real briefing', () => {
    expect(isMetaGroupContext('דן ושרה עדיין מתלבטים על אילת. האווירה קלילה, מחכים לאישור מלון.')).toBe(false);
    expect(isMetaGroupContext('Dan still wants sushi Friday. Mood is jokey; the Airbnb is unconfirmed.')).toBe(false);
  });
});

describe('usableGroupContext', () => {
  it('drops meta and empty text', () => {
    expect(usableGroupContext('')).toBe('');
    expect(usableGroupContext('I have nothing. Empty group.')).toBe('');
    expect(usableGroupContext('דן סוגר מקום לשישי')).toBe('דן סוגר מקום לשישי');
  });
});

describe('isThinEpisodeSummary', () => {
  it('flags placeholders and very short notes', () => {
    expect(isThinEpisodeSummary('Group activity.')).toBe(true);
    expect(isThinEpisodeSummary('ok')).toBe(true);
    expect(isThinEpisodeSummary('דן ושרה נסעו לאילת וחזרו עם ויכוח על המלון')).toBe(false);
  });
});
