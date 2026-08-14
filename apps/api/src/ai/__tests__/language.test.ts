import { describe, expect, it } from 'bun:test';
import { hebrewAwareModel, synthesisLanguageInstruction } from '../language.js';
import { buildEpisodeSummaryPrompt } from '../summarizer.js';

describe('hebrewAwareModel', () => {
  it('uses Sonnet for Hebrew and Haiku for English', () => {
    expect(hebrewAwareModel('he')).toContain('sonnet');
    expect(hebrewAwareModel('auto')).toContain('sonnet');
    expect(hebrewAwareModel('en')).toContain('haiku');
  });
});

describe('synthesisLanguageInstruction', () => {
  it('writes the Hebrew rule in Hebrew', () => {
    const he = synthesisLanguageInstruction('he');
    expect(he).toContain('עברית מדוברת');
    expect(he).toContain('בלי markdown');
    expect(he).not.toContain('Write ALL output');
  });
});

describe('buildEpisodeSummaryPrompt', () => {
  it('asks for grammatical Hebrew summaries in he mode', () => {
    const prompt = buildEpisodeSummaryPrompt('דן: מי בא בשישי?', 'he');
    expect(prompt).toContain('משפטים תקינים');
    expect(prompt).toContain('התאם מין לשמות');
    expect(prompt).toContain('דן: מי בא בשישי?');
  });
});
