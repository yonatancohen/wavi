import { describe, expect, it } from 'bun:test';
import { applyCanonicalNames, formatMemberRoster, resolveSenderLabel } from '../name-canon.js';

const people = [
  { display_name: 'גל', aliases: ['My Love', 'Gal'], wa_user_id: '1' },
  { display_name: 'חן', aliases: ['Chen', "צ'ן"], wa_user_id: '2' },
];

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
});
