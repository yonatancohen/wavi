import { describe, expect, it } from 'bun:test';
import {
  extractMentionLabels,
  mergeAliases,
  messageReferencesName,
  nameAppearsInText,
  namesLikelyMatch,
  normalizeNameForMatch,
  parsePhoneFromLabel,
  resolveSenderIdentity,
  stripGreetingOpener,
  stripUnicodeDirectionMarks,
} from '../identity.js';

describe('stripUnicodeDirectionMarks', () => {
  it('strips isolate chars from Hebrew @mentions', () => {
    const raw = '@\u2068My Love ❤️\u2069 התקשרו';
    expect(stripUnicodeDirectionMarks(raw)).toBe('@My Love ❤️ התקשרו');
  });
});

describe('parsePhoneFromLabel', () => {
  it('extracts digits from phone-only sender labels', () => {
    expect(parsePhoneFromLabel('+972 50-123-4567')).toBe('972501234567');
    expect(parsePhoneFromLabel('~972501234567')).toBe('972501234567');
  });

  it('returns null for contact names', () => {
    expect(parsePhoneFromLabel('Alon Arroyo')).toBeNull();
  });
});

describe('resolveSenderIdentity', () => {
  it('uses phone as wa_user_id for phone labels', () => {
    const id = resolveSenderIdentity('+972 50-123-4567');
    expect(id.wa_user_id).toBe('972501234567');
    expect(id.id_source).toBe('phone');
  });

  it('uses label as wa_user_id for contact names', () => {
    const id = resolveSenderIdentity('Chen Arroyo');
    expect(id.wa_user_id).toBe('Chen Arroyo');
    expect(id.id_source).toBe('export_label');
  });
});

describe('namesLikelyMatch', () => {
  it('matches exact normalized names', () => {
    expect(namesLikelyMatch('Alon Arroyo', 'alon arroyo')).toBe(true);
  });

  it('matches first-name overlap', () => {
    expect(namesLikelyMatch('Alon Arroyo', 'Alon')).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(namesLikelyMatch('Chen', 'Dan')).toBe(false);
  });
});

describe('mergeAliases', () => {
  it('dedupes case-insensitively', () => {
    expect(mergeAliases(['Alon'], 'alon', 'ALON')).toEqual(['Alon']);
  });
});

describe('extractMentionLabels', () => {
  it('extracts mention before Hebrew message text', () => {
    const labels = extractMentionLabels('@My Love ❤️ התקשרו אליכם');
    expect(labels).toContain('My Love ❤️');
  });
});

describe('normalizeNameForMatch', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeNameForMatch('  Alon   Arroyo ')).toBe('alon arroyo');
  });
});

describe('nameAppearsInText', () => {
  it('matches a Hebrew name with a clitic prefix', () => {
    expect(nameAppearsInText('דברתי עם לאלון אתמול', 'אלון')).toBe(true);
  });

  it('does not match Gal inside Galaxy', () => {
    expect(nameAppearsInText('Galaxy trip', 'Gal')).toBe(false);
  });

  it('matches a standalone Latin first name', () => {
    expect(nameAppearsInText('ask Alon later', 'Alon')).toBe(true);
  });
});

describe('messageReferencesName', () => {
  it('does not treat a greeting opener as a person', () => {
    expect(messageReferencesName('שאביז. בוא נלך לראות ספיידרמן', 'שאביז', ['שאביז'])).toBe(false);
  });

  it('still matches a name that appears after the greeting', () => {
    expect(messageReferencesName('שאביז. תזרימי את אלון', 'אלון', [])).toBe(true);
  });

  it('matches Alon via first-name alias after greeting slang', () => {
    expect(messageReferencesName('שאביז. בוא נלך עם Alon', 'Alon Arroyo', ['Alon'])).toBe(true);
  });
});

describe('stripGreetingOpener', () => {
  it('strips שאביז. from the start of a message', () => {
    expect(stripGreetingOpener('שאביז. בוא נלך לראות ספיידרמן')).toBe('בוא נלך לראות ספיידרמן');
  });
});
