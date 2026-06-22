import { describe, expect, it } from 'bun:test';
import { extractMentionLabels, mergeAliases, namesLikelyMatch, normalizeNameForMatch, parsePhoneFromLabel, resolveSenderIdentity, stripUnicodeDirectionMarks } from '../identity.js';

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
