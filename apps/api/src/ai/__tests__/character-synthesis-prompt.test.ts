import { describe, expect, it } from 'bun:test';
import { buildCharacterSynthesisPrompt } from '../summarizer.js';

describe('buildCharacterSynthesisPrompt', () => {
  it('labels facts, people, and real lines as separate channels', () => {
    const prompt = buildCharacterSynthesisPrompt({
      groupName: 'אדירים',
      episodeSummaries: ['יצאנו לאילת בקיץ'],
      userProfiles: ['דן: שנון וקצר'],
      relationshipNarratives: ['דן ושרה מתווכחים על תזמון'],
      voiceSamples: ['דן: בחיים לא יוצאים בשישי'],
      languageMode: 'he',
    });

    expect(prompt).toContain('GROUP HISTORY (facts only');
    expect(prompt).toContain('יצאנו לאילת בקיץ');
    expect(prompt).toContain('PEOPLE AND DYNAMICS');
    expect(prompt).toContain('דן: שנון וקצר');
    expect(prompt).toContain('דן ושרה מתווכחים על תזמון');
    expect(prompt).toContain('REAL LINES FROM THIS CHAT');
    expect(prompt).toContain('דן: בחיים לא יוצאים בשישי');
    expect(prompt).toContain('"stance"');
    expect(prompt).toContain('NOT a past-tense event');
  });
});
