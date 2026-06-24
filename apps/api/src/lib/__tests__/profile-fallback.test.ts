import { describe, it, expect } from 'bun:test';
import { buildMinimalProfileData, filterCrossMemberAliases, MIN_LLM_PROFILE_MESSAGES, minimalBehavioralSummary, parseProfileJson } from '../profile-fallback.js';

describe('parseProfileJson', () => {
  it('parses fenced JSON', () => {
    const parsed = parseProfileJson('```json\n{"humor_type":"dry","humor_score":10}\n```');
    expect(parsed.humor_type).toBe('dry');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseProfileJson('not json')).toThrow();
  });
});

describe('filterCrossMemberAliases', () => {
  it('removes aliases that match another member', () => {
    const result = filterCrossMemberAliases(['Yoni', 'חן', 'nickname'], 'Chen Arroyo', ['Yoni', 'Alon Arroyo', 'Chen Arroyo']);
    expect(result).toEqual(['חן', 'nickname']);
  });
});

describe('buildMinimalProfileData', () => {
  it('marks lurkers below message threshold', () => {
    expect(buildMinimalProfileData(2).activity_level).toBe('lurker');
    expect(buildMinimalProfileData(MIN_LLM_PROFILE_MESSAGES).activity_level).toBe('low');
  });
});

describe('minimalBehavioralSummary', () => {
  it('mentions export gap in Hebrew', () => {
    expect(minimalBehavioralSummary('Alon', 0, 'he')).toContain('אין הודעות');
  });
});
