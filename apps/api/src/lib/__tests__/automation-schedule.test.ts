import { describe, expect, it } from 'bun:test';
import { computeNextFireAt, zonedTimeToUtc } from '../automation-schedule.js';

describe('automation-schedule', () => {
  it('computes silence nudge next fire from threshold hours', () => {
    const from = new Date('2026-06-26T10:00:00.000Z');
    const next = computeNextFireAt('silence_nudge', { threshold_hours: 24 }, from);
    expect(next.toISOString()).toBe('2026-06-27T10:00:00.000Z');
  });

  it('computes the next daily digest time in the future', () => {
    const from = new Date('2026-06-26T08:00:00.000Z');
    const next = computeNextFireAt('daily_digest', { time: '09:00', frequency: 'daily', timezone: 'UTC' }, from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
    expect(next.toISOString()).toBe('2026-06-26T09:00:00.000Z');
  });

  it('converts wall-clock time in a timezone to UTC', () => {
    const utc = zonedTimeToUtc(2026, 6, 26, 9, 0, 'UTC');
    expect(utc.toISOString()).toBe('2026-06-26T09:00:00.000Z');
  });
});
