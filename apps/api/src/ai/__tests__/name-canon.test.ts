import { describe, expect, it } from 'bun:test';
import { applyCanonicalNames, expandCanonAliases, formatMemberRoster, resolveSenderLabel } from '../name-canon.js';

const people = [
  { display_name: 'גל', aliases: ['My Love', 'Gal'], wa_user_id: '1' },
  { display_name: 'חן', aliases: ['Chen', "צ'ן"], wa_user_id: '2' },
];

describe('expandCanonAliases', () => {
  it('adds צ׳ן when the curated name is חן', () => {
    const person = expandCanonAliases({ display_name: 'חן', aliases: ['Chen Arroyo'] });
    expect(person.aliases).toContain("צ'ן");
    expect(person.aliases).toContain('Chen');
    expect(applyCanonicalNames("אלון וצ'ן התווכחו", [person])).toContain('אלון וחן התווכחו');
  });
});

describe('formatMemberRoster', () => {
  it('lists canonical names with aliases', () => {
    const roster = formatMemberRoster(people);
    expect(roster).toContain('גל (also: My Love, Gal)');
    expect(roster).toContain("חן (also: Chen, צ'ן)");
  });
});

describe('resolveSenderLabel', () => {
  it('prefers the profile name for a wa id', () => {
    expect(resolveSenderLabel('1', 'My Love', people)).toBe('גל');
  });

  it('matches a contact nickname without a wa id', () => {
    expect(resolveSenderLabel(null, 'Chen', people)).toBe('חן');
  });
});

describe('applyCanonicalNames', () => {
  it('rewrites My Love and Chen spellings to curated names', () => {
    const text = applyCanonicalNames(`צ'ן לא "My Love" בכלל. Chen בדקה תאריכים.`, people);
    expect(text).toContain('חן לא "גל" בכלל');
    expect(text).toContain('חן בדקה תאריכים');
    expect(text).not.toContain('My Love');
    expect(text).not.toContain('Chen');
  });

  it('does not rewrite inside longer Latin words', () => {
    expect(applyCanonicalNames('Galaxy trip', [{ display_name: 'גל', aliases: ['Gal'] }])).toBe('Galaxy trip');
  });

  it('rewrites צ׳ן to חן even without a People-tab roster', () => {
    expect(applyCanonicalNames("יוני שאל את צ'ן מה כדאי", [])).toBe('יוני שאל את חן מה כדאי');
    expect(applyCanonicalNames('אלון וצ׳ן התווכחו', [])).toBe('אלון וחן התווכחו');
  });

  it('uses חן in Hebrew prose when People still says Chen Arroyo', () => {
    const person = expandCanonAliases({ display_name: 'Chen Arroyo', aliases: ['Chen'] });
    const text = applyCanonicalNames("אלון וצ'ן התווכחו בצחוק", [person]);
    expect(text).toContain('אלון וחן התווכחו');
    expect(text).not.toContain("צ'ן");
    expect(text).not.toContain('Chen');
  });
});
