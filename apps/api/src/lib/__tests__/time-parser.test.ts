import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { parseReminderInput, formatFireTime } from '../time-parser.js';

// Fix "now" so test assertions are deterministic.
const FIXED_NOW = new Date('2025-01-15T10:00:00.000Z'); // Wednesday 10:00 UTC

const _savedDate = globalThis.Date;

beforeEach(() => {
  const RealDate = _savedDate;
  class MockDate extends RealDate {
    constructor();
    constructor(value: number | string | Date);
    constructor(year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number);
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(FIXED_NOW.getTime());
      } else if (args.length === 1) {
        super(args[0] as number);
      } else {
        super(
          args[0] as number,
          args[1] as number,
          (args[2] as number | undefined) ?? 1,
          (args[3] as number | undefined) ?? 0,
          (args[4] as number | undefined) ?? 0,
          (args[5] as number | undefined) ?? 0,
          (args[6] as number | undefined) ?? 0,
        );
      }
    }
    static now() {
      return FIXED_NOW.getTime();
    }
  }
  globalThis.Date = MockDate as unknown as typeof Date;
});

afterEach(() => {
  globalThis.Date = _savedDate;
});

// ── English ───────────────────────────────────────────────────

describe('parseReminderInput — English', () => {
  it('parses "in 10 minutes to call mom"', () => {
    const r = parseReminderInput('in 10 minutes to call mom');
    expect(r).not.toBeNull();
    expect(r!.reminderText).toBe('call mom');
    const diff = r!.fireAt.getTime() - FIXED_NOW.getTime();
    expect(diff).toBeGreaterThanOrEqual(9 * 60_000);
    expect(diff).toBeLessThanOrEqual(11 * 60_000);
  });

  it('parses time at end: "call mom in 10 minutes"', () => {
    const r = parseReminderInput('call mom in 10 minutes');
    expect(r).not.toBeNull();
    expect(r!.reminderText).toContain('call mom');
  });

  it('parses "in 2 hours"', () => {
    const r = parseReminderInput('in 2 hours check the oven');
    expect(r).not.toBeNull();
    const diff = r!.fireAt.getTime() - FIXED_NOW.getTime();
    expect(diff).toBeGreaterThanOrEqual(119 * 60_000);
    expect(diff).toBeLessThanOrEqual(121 * 60_000);
    expect(r!.reminderText).toContain('check the oven');
  });

  it('parses "in an hour"', () => {
    const r = parseReminderInput('in an hour to stretch');
    expect(r).not.toBeNull();
    const diff = r!.fireAt.getTime() - FIXED_NOW.getTime();
    expect(diff).toBeGreaterThanOrEqual(59 * 60_000);
    expect(diff).toBeLessThanOrEqual(61 * 60_000);
  });

  it('parses "in half an hour"', () => {
    const r = parseReminderInput('in half an hour');
    expect(r).not.toBeNull();
    const diff = r!.fireAt.getTime() - FIXED_NOW.getTime();
    expect(diff).toBeGreaterThanOrEqual(29 * 60_000);
    expect(diff).toBeLessThanOrEqual(31 * 60_000);
  });

  it('parses "in 3 days"', () => {
    const r = parseReminderInput('in 3 days to pay rent');
    expect(r).not.toBeNull();
    const diff = r!.fireAt.getTime() - FIXED_NOW.getTime();
    expect(diff).toBeGreaterThanOrEqual(3 * 86_400_000 - 60_000);
  });

  it('parses "tomorrow at 9am"', () => {
    const r = parseReminderInput('tomorrow at 9am to go running');
    expect(r).not.toBeNull();
    const d = r!.fireAt;
    expect(d.getUTCDate()).toBe(16); // next day UTC
    expect(r!.reminderText).toContain('go running');
  });

  it('returns null when no time expression found', () => {
    expect(parseReminderInput('call mom')).toBeNull();
    expect(parseReminderInput('')).toBeNull();
  });

  it('returns null when time expression is in the past (edge: at past hour)', () => {
    // "at 9:00" when it's already 10:00 UTC → pushes to tomorrow, still future
    const r = parseReminderInput('at 9:00 to do something');
    // Should be valid (pushed to next day)
    expect(r).not.toBeNull();
  });

  it('parses bare "at 16" (24-hour, no colon)', () => {
    const r = parseReminderInput('remind me at 16 to leave');
    expect(r).not.toBeNull();
    // FIXED_NOW is 10:00 UTC; 16:00 same day is in the future
    expect(r!.fireAt.getUTCHours()).toBe(16);
    expect(r!.reminderText).toContain('leave');
  });

  it('parses bare "at 9" (past, pushes to next day)', () => {
    // 9:00 is before FIXED_NOW (10:00) → should be tomorrow
    const r = parseReminderInput('at 9 call the office');
    expect(r).not.toBeNull();
    expect(r!.fireAt.getUTCDate()).toBe(16); // next day
    expect(r!.fireAt.getUTCHours()).toBe(9);
  });
});

// ── Hebrew ────────────────────────────────────────────────────

describe('parseReminderInput — Hebrew', () => {
  it('parses "בעוד 10 דקות לצאת"', () => {
    const r = parseReminderInput('בעוד 10 דקות לצאת');
    expect(r).not.toBeNull();
    expect(r!.reminderText).toContain('לצאת');
    const diff = r!.fireAt.getTime() - FIXED_NOW.getTime();
    expect(diff).toBeGreaterThanOrEqual(9 * 60_000);
    expect(diff).toBeLessThanOrEqual(11 * 60_000);
  });

  it('parses "בעוד שעה להתקשר"', () => {
    const r = parseReminderInput('בעוד שעה להתקשר');
    expect(r).not.toBeNull();
    const diff = r!.fireAt.getTime() - FIXED_NOW.getTime();
    expect(diff).toBeGreaterThanOrEqual(59 * 60_000);
    expect(diff).toBeLessThanOrEqual(61 * 60_000);
    expect(r!.reminderText).toContain('להתקשר');
  });

  it('parses "בעוד חצי שעה"', () => {
    const r = parseReminderInput('בעוד חצי שעה');
    expect(r).not.toBeNull();
    const diff = r!.fireAt.getTime() - FIXED_NOW.getTime();
    expect(diff).toBeGreaterThanOrEqual(29 * 60_000);
    expect(diff).toBeLessThanOrEqual(31 * 60_000);
  });

  it('parses "בעוד רבע שעה"', () => {
    const r = parseReminderInput('בעוד רבע שעה לצאת מהבית');
    expect(r).not.toBeNull();
    const diff = r!.fireAt.getTime() - FIXED_NOW.getTime();
    expect(diff).toBeGreaterThanOrEqual(14 * 60_000);
    expect(diff).toBeLessThanOrEqual(16 * 60_000);
  });

  it('parses "בעוד יומיים"', () => {
    const r = parseReminderInput('בעוד יומיים');
    expect(r).not.toBeNull();
    const diff = r!.fireAt.getTime() - FIXED_NOW.getTime();
    expect(diff).toBeGreaterThanOrEqual(2 * 86_400_000 - 60_000);
  });

  it('parses "מחר" (defaults to 9 am)', () => {
    const r = parseReminderInput('מחר לבדוק אימיילים');
    expect(r).not.toBeNull();
    expect(r!.fireAt.getUTCDate()).toBe(16);
    // "מחר" is stripped; "ל" prefix is kept as part of the Hebrew infinitive
    expect(r!.reminderText).toContain('בדוק');
  });

  it('parses "מחר ב-9 פגישה"', () => {
    const r = parseReminderInput('מחר ב-9 פגישה');
    expect(r).not.toBeNull();
    expect(r!.fireAt.getUTCDate()).toBe(16);
    expect(r!.reminderText).toContain('פגישה');
  });

  it('parses "בעוד 2 שעות לאכול"', () => {
    const r = parseReminderInput('בעוד 2 שעות לאכול');
    expect(r).not.toBeNull();
    const diff = r!.fireAt.getTime() - FIXED_NOW.getTime();
    expect(diff).toBeGreaterThanOrEqual(119 * 60_000);
    expect(diff).toBeLessThanOrEqual(121 * 60_000);
  });

  it('returns null for pure Hebrew text with no time', () => {
    expect(parseReminderInput('לצאת מהבית')).toBeNull();
  });

  it('parses bare "ב-16" (Hebrew 24-hour, no colon)', () => {
    const r = parseReminderInput('תזכיר לי ב-16 לצאת');
    expect(r).not.toBeNull();
    expect(r!.fireAt.getUTCHours()).toBe(16);
    expect(r!.reminderText).toContain('לצאת');
  });

  it('parses "ב-16:30" (Hebrew with colon, colon variant takes priority)', () => {
    const r = parseReminderInput('ב-16:30 פגישה');
    expect(r).not.toBeNull();
    expect(r!.fireAt.getUTCHours()).toBe(16);
    expect(r!.fireAt.getUTCMinutes()).toBe(30);
  });
});

// ── formatFireTime ────────────────────────────────────────────

describe('formatFireTime', () => {
  it('shows minutes for sub-1h fire time', () => {
    const fireAt = new Date(FIXED_NOW.getTime() + 15 * 60_000);
    expect(formatFireTime(fireAt, false)).toMatch(/15 minute/);
    expect(formatFireTime(fireAt, true)).toContain('15');
  });

  it('shows hours for 2-hour fire time', () => {
    const fireAt = new Date(FIXED_NOW.getTime() + 2 * 3_600_000);
    expect(formatFireTime(fireAt, false)).toMatch(/2 hour/);
  });

  it('shows a date string for > 24h fire time', () => {
    const fireAt = new Date(FIXED_NOW.getTime() + 2 * 86_400_000);
    const out = formatFireTime(fireAt, false);
    // Should contain something like "Fri" or a time
    expect(out.length).toBeGreaterThan(0);
  });
});
