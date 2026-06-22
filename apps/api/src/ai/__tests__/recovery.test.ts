import { describe, expect, it } from 'bun:test';
import { detectNegativeReaction } from '../recovery.js';

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
