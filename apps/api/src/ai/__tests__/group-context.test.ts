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

  it('rewrites nicknames to curated names', () => {
    const people = [{ display_name: 'גל', aliases: ['My Love'], wa_user_id: '1' }];
    expect(formatLinesForContext([{ sender_name: 'My Love', sender_wa_id: '1', body: 'מגיעה' }], people)).toBe('גל: מגיעה');
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
      memberRoster: 'גל (also: My Love)\nחן (also: Chen)',
      languageMode: 'he',
    });

    expect(prompt).toContain('PEOPLE IN THIS GROUP');
    expect(prompt).toContain('גל (also: My Love)');
    expect(prompt).toContain('השם הראשי');
    expect(prompt).toContain('THINGS THAT HAPPENED');
    expect(prompt).toContain('REAL LINES FROM THIS CHAT');
    expect(prompt).toContain('דן, שרה: נסעו לאילת');
    expect(prompt).toContain('דן: מי בא בשישי?');
    expect(prompt).toContain('מדברים על סוף שבוע');
    expect(prompt).toContain('רק התדריך');
    expect(prompt).toContain('בלי markdown');
    expect(prompt).not.toContain('Write a SHORT context block');
    expect(prompt).not.toContain('Output ONLY the briefing');
  });
});
