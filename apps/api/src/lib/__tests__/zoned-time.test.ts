import { describe, expect, it } from 'bun:test';
import { formatNowInZone, formatRelativeMessageTime } from '../zoned-time.js';

const JERUSALEM = 'Asia/Jerusalem';

describe('formatRelativeMessageTime', () => {
  it('labels a Jerusalem after-midnight message as today, not UTC yesterday', () => {
    // 21:30 UTC 20 Aug = 00:30 IDT 21 Aug. 00:30 UTC 21 Aug = 03:30 IDT 21 Aug.
    const at = new Date('2026-08-20T21:30:00.000Z');
    const now = new Date('2026-08-21T00:30:00.000Z');
    expect(formatRelativeMessageTime(at, { now, timeZone: JERUSALEM, lang: 'en' })).toBe('today 00:30');
    expect(formatRelativeMessageTime(at, { now, timeZone: 'UTC', lang: 'en' })).toBe('yesterday 21:30');
  });

  it('labels the previous Jerusalem calendar day as yesterday', () => {
    const at = new Date('2026-08-20T10:00:00.000Z');
    const now = new Date('2026-08-21T07:00:00.000Z');
    expect(formatRelativeMessageTime(at, { now, timeZone: JERUSALEM, lang: 'en' })).toBe('yesterday 13:00');
    expect(formatRelativeMessageTime(at, { now, timeZone: JERUSALEM, lang: 'he' })).toBe('אתמול 13:00');
  });

  it('uses Hebrew today/yesterday labels', () => {
    const at = new Date('2026-08-21T07:00:00.000Z');
    const now = new Date('2026-08-21T08:00:00.000Z');
    expect(formatRelativeMessageTime(at, { now, timeZone: JERUSALEM, lang: 'he' })).toBe('היום 10:00');
  });

  it('uses weekday names for messages earlier in the week', () => {
    const at = new Date('2026-08-19T06:00:00.000Z');
    const now = new Date('2026-08-21T07:00:00.000Z');
    expect(formatRelativeMessageTime(at, { now, timeZone: JERUSALEM, lang: 'en' })).toBe('Wednesday 09:00');
    expect(formatRelativeMessageTime(at, { now, timeZone: JERUSALEM, lang: 'he' })).toContain('09:00');
    expect(formatRelativeMessageTime(at, { now, timeZone: JERUSALEM, lang: 'he' })).toMatch(/רביעי/);
  });
});

describe('formatNowInZone', () => {
  it('formats now in the requested timezone, not UTC wall clock', () => {
    const now = new Date('2026-08-21T07:00:00.000Z');
    const en = formatNowInZone(now, JERUSALEM, 'en');
    expect(en).toContain('Friday');
    expect(en).toContain('10:00');
    expect(en).not.toContain('07:00');

    const he = formatNowInZone(now, JERUSALEM, 'he');
    expect(he).toContain('שישי');
    expect(he).toContain('10:00');
  });
});
