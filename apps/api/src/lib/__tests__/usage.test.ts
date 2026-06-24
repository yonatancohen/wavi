import { describe, expect, it } from 'bun:test';
import { getDayStartUtc, getMonthStartUtc, getWeekStartSundayUtc } from '../usage-periods.js';

describe('usage period boundaries', () => {
  it('starts the week on Sunday UTC', () => {
    const wednesday = new Date('2025-06-25T15:30:00.000Z');
    const weekStart = getWeekStartSundayUtc(wednesday);
    expect(weekStart.toISOString()).toBe('2025-06-22T00:00:00.000Z');
  });

  it('keeps Sunday as the week start when already Sunday', () => {
    const sunday = new Date('2025-06-22T12:00:00.000Z');
    expect(getWeekStartSundayUtc(sunday).toISOString()).toBe('2025-06-22T00:00:00.000Z');
  });

  it('uses UTC day and month boundaries', () => {
    const date = new Date('2025-06-24T23:59:00.000Z');
    expect(getDayStartUtc(date).toISOString()).toBe('2025-06-24T00:00:00.000Z');
    expect(getMonthStartUtc(date).toISOString()).toBe('2025-06-01T00:00:00.000Z');
  });
});
