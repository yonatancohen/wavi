import { describe, expect, it } from 'bun:test';
import { buildTriggerBody, resolveAutomationModel } from '../proactive.js';

describe('resolveAutomationModel', () => {
  it('forces Sonnet for Hebrew and auto even if the group reply model is Haiku', () => {
    expect(resolveAutomationModel('he', { reply_model: 'claude-haiku-4-5' })).toBe('claude-sonnet-4-6');
    expect(resolveAutomationModel('auto', { reply_model: 'claude-haiku-4-5' })).toBe('claude-sonnet-4-6');
  });

  it('keeps the group reply model for English', () => {
    expect(resolveAutomationModel('en', { reply_model: 'claude-haiku-4-5' })).toBe('claude-haiku-4-5');
    expect(resolveAutomationModel('en', { reply_model: 'claude-sonnet-4-6' })).toBe('claude-sonnet-4-6');
  });
});

describe('buildTriggerBody', () => {
  it('writes the silence nudge in Hebrew for he/auto', () => {
    const he = buildTriggerBody('silence_nudge', { threshold_hours: 24 }, { languageMode: 'he' });
    expect(he).toContain('שקטה כבר 24 שעות');
    expect(he).toContain('עברית מדוברת');
    expect(he).not.toContain('the group has been quiet');
  });

  it('keeps the English silence nudge for en', () => {
    const en = buildTriggerBody('silence_nudge', { threshold_hours: 8 }, { elapsedHours: 12, languageMode: 'en' });
    expect(en).toContain('quiet for 12 hours');
    expect(en).not.toContain('שקטה');
  });

  it('writes scheduled-post hints in Hebrew for he mode', () => {
    const he = buildTriggerBody('scheduled_post', { time: '09:00', frequency: 'daily', template: 'סיכום בוקר' }, { languageMode: 'he' });
    expect(he).toContain('רמז: סיכום בוקר');
    expect(he).toContain('עברית מדוברת');
  });
});
