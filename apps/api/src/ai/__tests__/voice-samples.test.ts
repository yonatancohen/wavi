import { describe, expect, it } from 'bun:test';
import { selectVoiceSamples } from '../voice-samples.js';

describe('selectVoiceSamples', () => {
  it('prefers disagreement lines and spreads senders', () => {
    const samples = selectVoiceSamples(
      [
        { sender_name: 'Dan', body: 'לא נכון, בחיים לא הולכים לשם בשישי' },
        { sender_name: 'Dan', body: 'עוד שורה ארוכה מספיק בלי סיגנל בכלל על אותו אדם' },
        { sender_name: 'Sara', body: 'no way we are doing that again this year' },
        { sender_name: 'Agent', body: 'I am the bot saying something long enough', is_agent_reply: true },
        { sender_name: 'Dan', body: 'ok' },
        { sender_name: 'Lea', body: '<media omitted>' },
      ],
      4,
    );

    expect(samples[0]).toContain('Dan');
    expect(samples.some((line) => line.includes('Sara'))).toBe(true);
    expect(samples.some((line) => line.includes('bot saying'))).toBe(false);
    expect(samples.some((line) => line.includes('media'))).toBe(false);
  });

  it('skips short and oversized bodies', () => {
    const samples = selectVoiceSamples([
      { sender_name: 'A', body: 'too short' },
      { sender_name: 'B', body: 'x'.repeat(220) },
    ]);
    expect(samples).toEqual([]);
  });
});
