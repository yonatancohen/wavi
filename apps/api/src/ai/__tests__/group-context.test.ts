import { describe, expect, it } from 'bun:test';
import { formatEventsForContext, formatLinesForContext } from '../group-context.js';
import { buildGroupContextPrompt } from '../summarizer.js';

describe('formatEventsForContext', () => {
  it('formats who, what, when, and why', () => {
    const text = formatEventsForContext([
      {
        who: ['דן', 'שרה'],
        what: 'נסעו לאילת',
        occurred_on: '2026-08-01T12:00:00.000Z',
        why_it_matters: 'עדיין מדברים על זה',
      },
    ]);

    expect(text).toContain('דן, שרה: נסעו לאילת');
    expect(text).toContain('(2026-08-01)');
    expect(text).toContain('עדיין מדברים על זה');
  });

  it('falls back when who is empty', () => {
    expect(formatEventsForContext([{ who: [], what: 'יש תוכנית', occurred_on: null, why_it_matters: null }])).toBe('- ?: יש תוכנית');
  });
});

describe('formatLinesForContext', () => {
  it('formats sender lines in order', () => {
    expect(formatLinesForContext([{ sender_name: 'דן', body: 'מי בא?' }])).toBe('דן: מי בא?');
  });
});

describe('buildGroupContextPrompt', () => {
  it('includes remembered events and real lines, and forbids meta complaints', () => {
    const prompt = buildGroupContextPrompt({
      groupName: 'אדירים',
      recentContent: 'מדברים על סוף שבוע',
      previousContext: 'חיכו לאישור',
      recentEvents: '- דן, שרה: נסעו לאילת (2026-08-01)',
      recentLines: 'דן: מי בא בשישי?',
      languageMode: 'he',
    });

    expect(prompt).toContain('THINGS THAT HAPPENED');
    expect(prompt).toContain('REAL LINES FROM THIS CHAT');
    expect(prompt).toContain('דן, שרה: נסעו לאילת');
    expect(prompt).toContain('דן: מי בא בשישי?');
    expect(prompt).toContain('מדברים על סוף שבוע');
    expect(prompt).toContain('Output ONLY the briefing');
    expect(prompt).not.toContain('Write a SHORT context block');
  });
});
