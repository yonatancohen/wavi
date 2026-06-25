// Natural-language time parser for the reminder command.
// Handles English and Hebrew patterns without external dependencies.
// Longer / more-specific patterns must appear before shorter ones that
// would also match (e.g. "חצי שעה" before "שעה").

const GROUP_TIMEZONE = process.env.GROUP_TIMEZONE ?? 'Asia/Jerusalem';

export interface ParsedReminder {
  fireAt: Date;
  reminderText: string;
}

type TimePattern = {
  regex: RegExp;
  // Returns the fire Date or null if the match can't produce a valid future time.
  parse: (match: RegExpMatchArray, now: Date) => Date | null;
};

// ── Helpers ───────────────────────────────────────────────────

function applyAmPm(h: number, ampm: string | undefined): number {
  const lower = ampm?.toLowerCase();
  if (lower === 'pm' && h < 12) return h + 12;
  if (lower === 'am' && h === 12) return 0;
  return h;
}

/** Set hh:mm on a Date object; push to next day if already past. */
function atTime(now: Date, h: number, min: number): Date {
  const d = new Date(now);
  d.setHours(h, min, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

// ── English patterns ──────────────────────────────────────────
// Ordered: most-specific first so a more-specific match wins.

const EN_PATTERNS: TimePattern[] = [
  // "in X hours and Y minutes"
  {
    regex: /\bin\s+(\d+)\s+(?:hours?|hrs?)\s+and\s+(\d+)\s+(?:minutes?|mins?)\b/i,
    parse: (m, now) => new Date(now.getTime() + parseInt(m[1], 10) * 3_600_000 + parseInt(m[2], 10) * 60_000),
  },
  // "in X minutes/hours/days/weeks"
  {
    regex: /\bin\s+(\d+)\s+(minutes?|mins?|hours?|hrs?|days?|weeks?)\b/i,
    parse: (m, now) => {
      const n = parseInt(m[1], 10);
      const u = m[2].toLowerCase();
      if (u.startsWith('min')) return new Date(now.getTime() + n * 60_000);
      if (u.startsWith('hour') || u.startsWith('hr')) return new Date(now.getTime() + n * 3_600_000);
      if (u.startsWith('day')) return new Date(now.getTime() + n * 86_400_000);
      if (u.startsWith('week')) return new Date(now.getTime() + n * 7 * 86_400_000);
      return null;
    },
  },
  // "in a/an hour/minute/day"
  {
    regex: /\bin\s+an?\s+(hour|minute|min|day)\b/i,
    parse: (m, now) => {
      const u = m[1].toLowerCase();
      if (u.startsWith('hour')) return new Date(now.getTime() + 3_600_000);
      if (u.startsWith('min')) return new Date(now.getTime() + 60_000);
      if (u.startsWith('day')) return new Date(now.getTime() + 86_400_000);
      return null;
    },
  },
  // "in half an hour"
  {
    regex: /\bin\s+half\s+an?\s+hour\b/i,
    parse: (_m, now) => new Date(now.getTime() + 30 * 60_000),
  },
  // "tomorrow at HH[:MM] [am/pm]"
  {
    regex: /\btomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
    parse: (m, now) => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(applyAmPm(parseInt(m[1], 10), m[3]), m[2] ? parseInt(m[2], 10) : 0, 0, 0);
      return d;
    },
  },
  // "tomorrow" (defaults to 9 am)
  {
    regex: /\btomorrow\b/i,
    parse: (_m, now) => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  // "tonight at HH[:MM] [am/pm]"
  {
    regex: /\btonight\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
    parse: (m, now) => atTime(now, applyAmPm(parseInt(m[1], 10), m[3]), m[2] ? parseInt(m[2], 10) : 0),
  },
  // "tonight" (defaults to 9 pm)
  {
    regex: /\btonight\b/i,
    parse: (_m, now) => atTime(now, 21, 0),
  },
  // "at HH[:MM] [am/pm]"
  {
    regex: /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
    parse: (m, now) => atTime(now, applyAmPm(parseInt(m[1], 10), m[3]), m[2] ? parseInt(m[2], 10) : 0),
  },
  // "at HH:MM" (24-h with colon, no am/pm)
  {
    regex: /\bat\s+(\d{1,2}):(\d{2})\b/i,
    parse: (m, now) => atTime(now, parseInt(m[1], 10), parseInt(m[2], 10)),
  },
  // "at 16" — bare 24-hour hour, no colon and no am/pm.
  // Must come after the colon and am/pm patterns so they take priority.
  {
    regex: /\bat\s+(\d{1,2})\b/i,
    parse: (m, now) => atTime(now, parseInt(m[1], 10), 0),
  },
];

// ── Hebrew patterns ───────────────────────────────────────────
// RTL text — patterns written left-to-right in the regex but match
// Hebrew strings. Longer / more-specific phrases come first.

const HE_PATTERNS: TimePattern[] = [
  // "בעוד X שעות ו-Y דקות"
  {
    regex: /(?:בעוד|עוד)\s+(\d+)\s+שעות?\s+ו-?(\d+)\s+דקות?/,
    parse: (m, now) => new Date(now.getTime() + parseInt(m[1], 10) * 3_600_000 + parseInt(m[2], 10) * 60_000),
  },
  // "בעוד חצי שעה"
  {
    regex: /(?:בעוד|עוד)\s+חצי\s+שעה/,
    parse: (_m, now) => new Date(now.getTime() + 30 * 60_000),
  },
  // "בעוד רבע שעה"
  {
    regex: /(?:בעוד|עוד)\s+רבע\s+שעה/,
    parse: (_m, now) => new Date(now.getTime() + 15 * 60_000),
  },
  // "בעוד שעה וחצי"
  {
    regex: /(?:בעוד|עוד)\s+שעה\s+וחצי/,
    parse: (_m, now) => new Date(now.getTime() + 90 * 60_000),
  },
  // "בעוד שעה"
  // No \b here — Hebrew chars are \W so \b never fires between them.
  // Longer patterns ("שעה וחצי") appear earlier and take priority.
  {
    regex: /(?:בעוד|עוד)\s+שעה(?=\s|$)/,
    parse: (_m, now) => new Date(now.getTime() + 3_600_000),
  },
  // "בעוד שבוע"
  {
    regex: /(?:בעוד|עוד)\s+שבוע(?=\s|$)/,
    parse: (_m, now) => new Date(now.getTime() + 7 * 86_400_000),
  },
  // "בעוד יומיים"
  {
    regex: /(?:בעוד|עוד)\s+יומיים/,
    parse: (_m, now) => new Date(now.getTime() + 2 * 86_400_000),
  },
  // "בעוד X דקות/שעות/ימים/שבועות" (numeric)
  {
    regex: /(?:בעוד|עוד)\s+(\d+)\s+(דקות?|שעות?|ימים?|יום|שבועות?|שבוע)/,
    parse: (m, now) => {
      const n = parseInt(m[1], 10);
      const u = m[2];
      if (u.startsWith('דק')) return new Date(now.getTime() + n * 60_000);
      if (u.startsWith('שע')) return new Date(now.getTime() + n * 3_600_000);
      if (u.startsWith('יו') || u.startsWith('ימ')) return new Date(now.getTime() + n * 86_400_000);
      if (u.startsWith('שב')) return new Date(now.getTime() + n * 7 * 86_400_000);
      return null;
    },
  },
  // "מחר ב-HH[:MM]" or "מחר בשעה HH"
  {
    regex: /מחר\s+(?:בשעה\s+|ב-?)(\d{1,2})(?::(\d{2}))?/,
    parse: (m, now) => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0, 0, 0);
      return d;
    },
  },
  // "מחר" (defaults to 9 am)
  {
    regex: /מחר/,
    parse: (_m, now) => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  // "הלילה ב-HH[:MM]"
  {
    regex: /הלילה\s+(?:ב-?)(\d{1,2})(?::(\d{2}))?/,
    parse: (m, now) => atTime(now, parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0),
  },
  // "הלילה" (defaults to 9 pm)
  {
    regex: /הלילה/,
    parse: (_m, now) => atTime(now, 21, 0),
  },
  // "בשעה HH[:MM]"
  {
    regex: /בשעה\s+(\d{1,2})(?::(\d{2}))?/,
    parse: (m, now) => atTime(now, parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0),
  },
  // "ב-HH:MM" (with explicit colon)
  {
    regex: /ב-(\d{1,2}):(\d{2})/,
    parse: (m, now) => atTime(now, parseInt(m[1], 10), parseInt(m[2], 10)),
  },
  // "ב-16" — bare 24-hour hour after ב-, no colon.
  // Must come after the colon variant so "ב-16:30" is not short-circuited.
  {
    regex: /ב-(\d{1,2})\b/,
    parse: (m, now) => atTime(now, parseInt(m[1], 10), 0),
  },
];

// ── Core parser ───────────────────────────────────────────────

function tryMatch(text: string, patterns: TimePattern[], now: Date): { fireAt: Date; matchedStr: string } | null {
  for (const p of patterns) {
    const m = text.match(p.regex);
    if (!m) continue;
    const fireAt = p.parse(m, now);
    if (fireAt && fireAt > now) {
      return { fireAt, matchedStr: m[0] };
    }
  }
  return null;
}

const LEADING_CONNECTORS_EN = /^(?:to\s+|about\s+|that\s+|and\s+|–\s*|-\s*)/i;
// "ל" is the Hebrew infinitive prefix and part of the reminder text ("לצאת", "להתקשר").
// Only strip it when it's followed by a dash (ל-), which signals a different preposition.
const LEADING_CONNECTORS_HE = /^(?:ל-|על\s+|ש-|אחרי\s+|–\s*|-\s*)/;

/**
 * Parse a natural-language reminder input (the part after stripping the command
 * prefix like "remind me" / "תזכיר לי"). Returns the scheduled time and the
 * cleaned reminder text, or null if no recognisable time expression is found.
 *
 * Examples:
 *   "in 10 minutes to call mom"  → { fireAt: +10min, reminderText: "call mom" }
 *   "call mom in 10 minutes"     → { fireAt: +10min, reminderText: "call mom" }
 *   "בעוד 20 דקות לצאת"         → { fireAt: +20min, reminderText: "לצאת" }
 */
export function parseReminderInput(rawText: string): ParsedReminder | null {
  const now = new Date();
  const isHebrew = /[\u0590-\u05FF]/.test(rawText);

  // Prefer language-appropriate patterns first, then fall back to the other set.
  const ordered = isHebrew ? [...HE_PATTERNS, ...EN_PATTERNS] : [...EN_PATTERNS, ...HE_PATTERNS];

  const hit = tryMatch(rawText, ordered, now);
  if (!hit) return null;

  // Strip the matched time expression and tidy up the remainder.
  let text = rawText.replace(hit.matchedStr, ' ').replace(/\s+/g, ' ').trim();

  // Strip common leading connectors that are artifacts of the sentence structure.
  text = text.replace(isHebrew ? LEADING_CONNECTORS_HE : LEADING_CONNECTORS_EN, '').trim();

  // If nothing meaningful is left, keep the raw input without the time part.
  const reminderText = text || rawText.replace(hit.matchedStr, '').trim();

  return { fireAt: hit.fireAt, reminderText };
}

// ── Human-readable time delta ─────────────────────────────────

/**
 * Return a short human-readable description of when a reminder will fire.
 * Used in the confirmation reply to the user.
 */
export function formatFireTime(fireAt: Date, isHebrew: boolean): string {
  const diffMs = fireAt.getTime() - Date.now();

  if (diffMs < 60 * 60_000) {
    const mins = Math.max(1, Math.round(diffMs / 60_000));
    return isHebrew ? `בעוד ${mins} דקות` : `in ${mins} minute${mins !== 1 ? 's' : ''}`;
  }

  if (diffMs < 24 * 3_600_000) {
    const hours = Math.floor(diffMs / 3_600_000);
    const mins = Math.round((diffMs % 3_600_000) / 60_000);
    if (mins === 0) return isHebrew ? `בעוד ${hours} שעות` : `in ${hours} hour${hours !== 1 ? 's' : ''}`;
    return isHebrew ? `בעוד ${hours} שעות ו-${mins} דקות` : `in ${hours}h ${mins}m`;
  }

  // > 24 hours: show weekday + time in group timezone.
  return fireAt.toLocaleString(isHebrew ? 'he-IL' : 'en-US', {
    timeZone: GROUP_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
