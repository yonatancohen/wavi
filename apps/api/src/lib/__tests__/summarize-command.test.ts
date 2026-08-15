import { describe, expect, it } from 'bun:test';
import { buildSummarizeCommandPrompt } from '../command-resolver.js';

describe('buildSummarizeCommandPrompt', () => {
  it('writes the summarize task in Hebrew', () => {
    const prompt = buildSummarizeCommandPrompt(true, 'חבר ותיק', 'דן: מי בא?');
    expect(prompt).toContain('עברית מדוברת');
    expect(prompt).toContain('חבר ותיק');
    expect(prompt).toContain('דן: מי בא?');
    expect(prompt).not.toContain('Summarize the last messages');
  });

  it('keeps the English summarize task for en', () => {
    const prompt = buildSummarizeCommandPrompt(false, 'old friend', 'Dan: who is coming?');
    expect(prompt).toContain('Summarize the last messages');
    expect(prompt).not.toContain('עברית מדוברת');
  });
});
