import { describe, expect, it } from 'bun:test';
import { extractInvokedNames, invokedRewriteInstruction, replyMissesInvokedPeople } from '../reply-grounding.js';

describe('extractInvokedNames', () => {
  it('extracts אלון from תזרימי את אלון', () => {
    expect(extractInvokedNames('שאביז. בוא נלך לראות ספיידרמן ביחד מה אומר? @wavi תזרימי את אלון')).toEqual(['אלון']);
  });

  it('extracts English bring-in targets', () => {
    expect(extractInvokedNames('hey @wavi bring Alon in')).toEqual(['Alon']);
    expect(extractInvokedNames('bring in Sara please')).toEqual(['Sara']);
  });

  it('returns empty when nobody is invoked', () => {
    expect(extractInvokedNames('שאביז. בוא נלך לראות ספיידרמן מה אומר?')).toEqual([]);
  });
});

describe('replyMissesInvokedPeople', () => {
  it('is true when the reply never names the invoked person', () => {
    expect(replyMissesInvokedPeople('מגזינו זה מהלך, סוף סוף אוכל טוב', [{ display_name: 'Alon Arroyo', aliases: ['Alon'], invoked_as: 'אלון' }])).toBe(true);
  });

  it('is false when the reply uses the Hebrew invoked name', () => {
    expect(replyMissesInvokedPeople('אלון, בוא לספיידרמן', [{ display_name: 'Alon Arroyo', aliases: ['Alon'], invoked_as: 'אלון' }])).toBe(false);
  });

  it('is false when the reply uses a Latin alias', () => {
    expect(replyMissesInvokedPeople('Alon you in for Spider-Man?', [{ display_name: 'Alon Arroyo', aliases: ['Alon'], invoked_as: 'אלון' }])).toBe(false);
  });

  it('is false when nobody was invoked', () => {
    expect(replyMissesInvokedPeople('whatever', [])).toBe(false);
  });
});

describe('invokedRewriteInstruction', () => {
  it('names the people who were skipped in English by default', () => {
    const text = invokedRewriteInstruction([{ display_name: 'Alon Arroyo', invoked_as: 'אלון' }]);
    expect(text).toContain('אלון');
    expect(text).toContain('Your last reply did not involve');
  });

  it('uses Hebrew instructional copy when he=true', () => {
    const text = invokedRewriteInstruction([{ display_name: 'Alon Arroyo', invoked_as: 'אלון' }], true);
    expect(text).toContain('אלון');
    expect(text).toContain('התשובה הקודמת שלך לא שילבה');
    expect(text).not.toContain('Your last reply');
  });
});
