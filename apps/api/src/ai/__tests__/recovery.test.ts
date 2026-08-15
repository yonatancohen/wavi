import { describe, expect, it } from 'bun:test';
import { buildApologyPrompt, detectNegativeReaction, fallbackApology } from '../recovery.js';

describe('detectNegativeReaction', () => {
  // ── Should trigger ────────────────────────────────────────

  it.each([
    // English patterns
    ["that's not funny", 'literal match'],
    ['that was off', 'past tense'],
    ['that is wrong', 'present tense'],
    ['bad bot', 'classic signal'],
    ['not cool man', 'not cool'],
    ['delete that please', 'delete request'],
    ['too far wavi', 'too far'],
    ['uncalled for', 'uncalled for'],
    ['wtf wavi', 'wtf bot'],
    ['shut up wavi', 'shut up bot'],
    ['@wavi that was wrong', '@ mention wrong'],
    ['@wavi you are bad', '@ mention bad'],
    ["@wavi you're awful", '@ mention awful'],
    // Hebrew
    ['זה לא מצחיק', 'Hebrew: not funny'],
    ['יותר מדי', 'Hebrew: too much'],
    ['לא בסדר', 'Hebrew: not ok'],
    ['תמחק את זה', 'Hebrew: delete that'],
  ])('returns true for: "%s" (%s)', (msg: string) => {
    expect(detectNegativeReaction(msg)).toBe(true);
  });

  // ── Should NOT trigger ────────────────────────────────────

  it.each([
    ["that's hilarious", 'positive reaction'],
    ['great bot', 'compliment'],
    ['what do you think?', 'neutral question'],
    ['haha', 'laugh'],
    ['ok that was funny', 'positive - not a negation'],
    ['wavi is cool', 'compliment about bot'],
    ['wtf is going on', 'wtf without bot name'],
    ['', 'empty string'],
  ])('returns false for: "%s" (%s)', (msg: string) => {
    expect(detectNegativeReaction(msg)).toBe(false);
  });

  it('is case-insensitive for English patterns', () => {
    expect(detectNegativeReaction("THAT'S NOT FUNNY")).toBe(true);
    expect(detectNegativeReaction('Bad Bot')).toBe(true);
    expect(detectNegativeReaction('SHUT UP WAVI')).toBe(true);
  });
});

describe('fallbackApology', () => {
  it('returns spoken Hebrew for he/auto', () => {
    expect(fallbackApology(80, 'he')).toContain('לא נחת');
    expect(fallbackApology(50, 'auto')).toContain('פספוס');
    expect(fallbackApology(20, 'he')).toContain('סליחה');
  });

  it('keeps English fallbacks for en', () => {
    expect(fallbackApology(80, 'en')).toContain("didn't land");
    expect(fallbackApology(20, 'en')).toContain('Sorry');
  });
});

describe('buildApologyPrompt', () => {
  it('writes the high-humor apology task in Hebrew', () => {
    const prompt = buildApologyPrompt('חבר ותיק בקבוצה', 'he');
    expect(prompt).toContain('עברית מדוברת');
    expect(prompt).toContain('חבר ותיק בקבוצה');
    expect(prompt).not.toContain('You are a witty');
  });
});
