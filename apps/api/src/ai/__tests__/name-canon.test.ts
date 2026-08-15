import { describe, expect, it } from 'bun:test';
import { applyCanonicalNames, expandCanonAliases, formatMemberRoster, resolveSenderLabel } from '../name-canon.js';
import { phoneticNameKey } from '../../lib/identity.js';

const people = [
  { display_name: 'גל', aliases: ['My Love', 'Gal'], wa_user_id: '1' },
  { display_name: 'חן', aliases: ['Chen'], wa_user_id: '2' },
];

describe('expandCanonAliases', () => {
  it('adds first-name tokens from the People-tab name, not a hardcoded list', () => {
    const person = expandCanonAliases({ display_name: 'חן', aliases: ['Chen Arroyo'] });
    expect(person.aliases).toContain('Chen');
    expect(person.aliases).toContain('Chen Arroyo');
    expect(person.aliases).not.toContain("צ'ן");
  });
});

describe('formatMemberRoster', () => {
  it('lists canonical names with aliases', () => {
    const roster = formatMemberRoster(people);
    expect(roster).toContain('גל (also: My Love, Gal)');
    expect(roster).toContain('חן (also: Chen)');
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

describe('phoneticNameKey', () => {
  it('collapses Latin and Hebrew spellings of the same name', () => {
    expect(phoneticNameKey('Chen')).toBe(phoneticNameKey('חן'));
    expect(phoneticNameKey("צ'ן")).toBe(phoneticNameKey('חן'));
    expect(phoneticNameKey('Gal')).toBe(phoneticNameKey('גל'));
    expect(phoneticNameKey('Ron')).toBe(phoneticNameKey('רון'));
    expect(phoneticNameKey('Yoni')).toBe(phoneticNameKey('יוני'));
  });
});

describe('applyCanonicalNames', () => {
  it('rewrites stored aliases to the People-tab name', () => {
    const text = applyCanonicalNames('Chen בדקה תאריכים עם My Love', people);
    expect(text).toContain('חן בדקה תאריכים עם גל');
    expect(text).not.toContain('My Love');
    expect(text).not.toContain('Chen');
  });

  it('rewrites invented transliterations to the roster name', () => {
    const text = applyCanonicalNames("יוני שאל את צ'ן ואת Ron", [
      { display_name: 'חן', aliases: ['Chen'] },
      { display_name: 'רון', aliases: ['Ron'] },
    ]);
    expect(text).toContain('יוני שאל את חן ואת רון');
    expect(text).not.toContain("צ'ן");
    expect(text).not.toContain('Ron');
  });

  it('does not invent a name when the roster is empty', () => {
    expect(applyCanonicalNames("יוני שאל את צ'ן מה כדאי", [])).toBe("יוני שאל את צ'ן מה כדאי");
  });

  it('uses the People-tab label, not a hardcoded Hebrew form', () => {
    const person = expandCanonAliases({ display_name: 'Chen Arroyo', aliases: ['Chen'] });
    const text = applyCanonicalNames("אלון וצ'ן התווכחו בצחוק", [person]);
    expect(text).toContain('אלון וChen Arroyo התווכחו');
    expect(text).not.toContain("צ'ן");
  });

  it('does not rewrite inside longer Latin words', () => {
    expect(applyCanonicalNames('Galaxy trip', [{ display_name: 'גל', aliases: ['Gal'] }])).toBe('Galaxy trip');
  });
});
