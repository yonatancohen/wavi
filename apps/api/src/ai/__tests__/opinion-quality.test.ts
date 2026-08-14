import { describe, expect, it } from 'bun:test';
import {
  evaluateOpinion,
  filterValidOpinions,
  flattenOpinion,
  isGenericOpinion,
  isRecapOpinion,
  parseSynthesisOpinions,
} from '../opinion-quality.js';

describe('flattenOpinion', () => {
  it('trims a string opinion', () => {
    expect(flattenOpinion('  pizza closes the night  ')).toBe('pizza closes the night');
  });

  it('returns stance only when because is missing', () => {
    expect(flattenOpinion({ topic: 'food', stance: 'Good plans end with food' })).toBe(
      'Good plans end with food',
    );
  });

  it('appends because when stance is under 40 chars', () => {
    expect(
      flattenOpinion({
        topic: 'outdoors',
        stance: 'Stop planning hikes',
        because: 'it always rains',
      }),
    ).toBe('Stop planning hikes — it always rains');
  });

  it('keeps stance only when stance is 40+ chars', () => {
    const stance = 'Every outdoor plan in this group is a rain dance';
    expect(stance.length).toBeGreaterThanOrEqual(40);
    expect(flattenOpinion({ topic: 'outdoors', stance, because: 'history repeats' })).toBe(stance);
  });
});

describe('isRecapOpinion', () => {
  it('rejects English recaps', () => {
    expect(isRecapOpinion('We went to Eilat last summer')).toBe(true);
    expect(isRecapOpinion('The group decided to stay in')).toBe(true);
  });

  it('rejects Hebrew recaps', () => {
    expect(isRecapOpinion('יצאנו לאילת בקיץ')).toBe(true);
    expect(isRecapOpinion('הקבוצה החליטה להישאר בבית')).toBe(true);
  });

  it('accepts present-tense stances that mention a past event as reason', () => {
    expect(
      isRecapOpinion(
        'Every time we try to plan something outdoors it rains — we should just stop pretending',
      ),
    ).toBe(false);
    expect(isRecapOpinion('אם לא יצאנו ב-22:00 בדיוק, הלילה נגמר בפיצה אצל אחד מאיתנו ולא בבר')).toBe(
      false,
    );
    expect(isRecapOpinion('תכנון יוצאים צריך להסתיים עם אוכל טוב')).toBe(false);
  });
});

describe('isGenericOpinion', () => {
  it('rejects vague English filler', () => {
    expect(isGenericOpinion('Planning is fun')).toBe(true);
    expect(isGenericOpinion('Good food is important')).toBe(true);
  });

  it('rejects vague Hebrew filler', () => {
    expect(isGenericOpinion('אוכל זה חשוב')).toBe(true);
    expect(isGenericOpinion('תכנון זה כיף')).toBe(true);
    expect(isGenericOpinion('הומור חשוב')).toBe(true);
  });

  it('accepts specific stances', () => {
    expect(isGenericOpinion('תכנון יוצאים צריך להסתיים עם אוכל טוב')).toBe(false);
    expect(
      isGenericOpinion(
        'Every time we try to plan something outdoors it rains — we should just stop pretending',
      ),
    ).toBe(false);
  });
});

describe('evaluateOpinion', () => {
  it('flags empty, short, long, generic, and recap', () => {
    expect(evaluateOpinion('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(evaluateOpinion('too short')).toEqual({ ok: false, reason: 'too_short' });
    expect(evaluateOpinion('x'.repeat(181))).toEqual({ ok: false, reason: 'too_long' });
    expect(evaluateOpinion('Planning is fun')).toEqual({ ok: false, reason: 'generic' });
    expect(evaluateOpinion('We went to Eilat last summer')).toEqual({ ok: false, reason: 'recap' });
  });

  it('accepts a specific stance', () => {
    expect(evaluateOpinion('תכנון יוצאים צריך להסתיים עם אוכל טוב')).toEqual({ ok: true });
  });
});

describe('filterValidOpinions', () => {
  it('drops recaps and keeps stances, unique by lowercase', () => {
    expect(
      filterValidOpinions([
        '  We went to Eilat last summer  ',
        'The group decided to stay in',
        'תכנון יוצאים צריך להסתיים עם אוכל טוב',
        'תכנון יוצאים צריך להסתיים עם אוכל טוב',
        'Every time we try to plan something outdoors it rains — we should just stop pretending',
        'Planning is fun',
        '',
      ]),
    ).toEqual([
      'תכנון יוצאים צריך להסתיים עם אוכל טוב',
      'Every time we try to plan something outdoors it rains — we should just stop pretending',
    ]);
  });
});

describe('parseSynthesisOpinions', () => {
  it('flattens structured objects and strings then filters', () => {
    expect(
      parseSynthesisOpinions([
        {
          topic: 'outdoors',
          stance: 'Stop planning hikes',
          because: 'it always rains on us',
        },
        'אם לא יצאנו ב-22:00 בדיוק, הלילה נגמר בפיצה אצל אחד מאיתנו ולא בבר',
        { topic: 'trip', stance: 'We went to Eilat last summer' },
        'Good food is important',
        { topic: 'food', stance: 'תכנון יוצאים צריך להסתיים עם אוכל טוב' },
      ]),
    ).toEqual([
      'Stop planning hikes — it always rains on us',
      'אם לא יצאנו ב-22:00 בדיוק, הלילה נגמר בפיצה אצל אחד מאיתנו ולא בבר',
      'תכנון יוצאים צריך להסתיים עם אוכל טוב',
    ]);
  });

  it('returns empty for non-arrays', () => {
    expect(parseSynthesisOpinions(null)).toEqual([]);
    expect(parseSynthesisOpinions({ stance: 'nope' })).toEqual([]);
  });
});
