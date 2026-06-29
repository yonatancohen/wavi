import type { ScheduledPostConfig } from '@wavi/shared';

export interface ParsedSchedule {
  config: ScheduledPostConfig;
  label: string;
}

const TIMEZONE = process.env.GROUP_TIMEZONE ?? 'Asia/Jerusalem';

const HE_DAYS: Record<string, number> = {
  ראשון: 0,
  שני: 1,
  שלישי: 2,
  רביעי: 3,
  חמישי: 4,
  שישי: 5,
  שבת: 6,
};

const EN_DAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function parseTime(raw: string): string | null {
  const colon = raw.match(/(\d{1,2})[:.:](\d{2})/);
  if (colon) return `${colon[1].padStart(2, '0')}:${colon[2]}`;
  const hourAmPm = raw.match(/(\d{1,2})\s*(am|pm)/i);
  if (hourAmPm) {
    let h = parseInt(hourAmPm[1]);
    if (hourAmPm[2].toLowerCase() === 'pm' && h < 12) h += 12;
    if (hourAmPm[2].toLowerCase() === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:00`;
  }
  const bare = raw.match(/^(\d{1,2})$/);
  if (bare) {
    const h = parseInt(bare[1]);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }
  return null;
}

function parseDayOfWeek(raw: string): number | null {
  const lower = raw.toLowerCase();
  for (const [name, idx] of Object.entries(HE_DAYS)) {
    if (lower.includes(name)) return idx;
  }
  for (const [name, idx] of Object.entries(EN_DAYS)) {
    if (lower.includes(name)) return idx;
  }
  return null;
}

const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Find time anywhere in the string.
// Accepts: "ב-18:00", "בשעה 21:00", "ב18:00", "at 6pm", "at 18:00", bare "21:00"
function findTime(text: string): string | null {
  // "בשעה 21:00" or "בשעה 21" (Hebrew "at hour")
  const heShaa = text.match(/בשעה\s+(\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:am|pm)|\d{1,2})/i);
  if (heShaa) return parseTime(heShaa[1].trim());

  // "ב-18:00" or "ב18:00" or "ב-18"
  const heBet = text.match(/ב-?(\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:am|pm))/i);
  if (heBet) return parseTime(heBet[1].trim());

  // "at 6pm" or "at 18:00"
  const enAt = text.match(/\bat\s+(\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:am|pm))/i);
  if (enAt) return parseTime(enAt[1].trim());

  // Bare time like "21:00" anywhere
  const bare = text.match(/\b(\d{1,2}:\d{2})\b/);
  if (bare) return parseTime(bare[1]);

  return null;
}

// Extract the human-readable label/template: strip trigger words, day tokens, and time tokens.
function extractLabel(text: string): string {
  return text
    .replace(/^(?:תקבע|תזכיר|תשלח|שלח|schedule|remind|post)\s+/i, '')
    .replace(/כל\s+יום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/gi, '')
    .replace(/כל\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/gi, '')
    .replace(/every\s+(?:day|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/gi, '')
    .replace(/כל\s+יום/gi, '')
    .replace(/בשעה\s+\d{1,2}[:.]\d{2}/gi, '')
    .replace(/בשעה\s+\d{1,2}/gi, '')
    .replace(/ב-?\d{1,2}[:.]\d{2}/gi, '')
    .replace(/\bat\s+\d{1,2}[:.]\d{2}/gi, '')
    .replace(/\bat\s+\d{1,2}\s*(?:am|pm)/gi, '')
    .replace(/\b\d{1,2}:\d{2}\b/g, '')
    .replace(/[.,،]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseScheduleCommand(body: string, agentName: string): ParsedSchedule | null {
  const stripped = body.replace(new RegExp(`@${agentName}`, 'gi'), '').trim();

  const isHe = /^(?:תקבע|תזכיר|תשלח|שלח)(?:\s|$)/.test(stripped);
  const isEn = /^(?:schedule|remind|post)\b/i.test(stripped);
  if (!isHe && !isEn) return null;

  const time = findTime(stripped);
  if (!time) return null;

  // Daily: "כל יום" or "every day"
  const isDaily = /כל\s+יום/.test(stripped) || /every\s+day/i.test(stripped);

  if (isDaily) {
    const template = extractLabel(stripped) || undefined;
    const config: ScheduledPostConfig = { frequency: 'daily', time, timezone: TIMEZONE, ...(template ? { template } : {}) };
    return { config, label: `כל יום ב-${time}${template ? ` — "${template}"` : ''}` };
  }

  // Weekly: find the day name
  const heDayMatch = stripped.match(/כל\s+(\S+)/);
  const enDayMatch = stripped.match(/every\s+(\w+)/i);
  const rawDay = heDayMatch?.[1] ?? enDayMatch?.[1] ?? '';
  const dayNum = parseDayOfWeek(rawDay);
  if (dayNum === null) return null;

  const template = extractLabel(stripped) || undefined;
  const config: ScheduledPostConfig = { frequency: 'weekly', weekday: dayNum, time, timezone: TIMEZONE, ...(template ? { template } : {}) };
  const dayName = isHe ? (DAY_NAMES_HE[dayNum] ?? rawDay) : (DAY_NAMES_EN[dayNum] ?? rawDay);
  const prefix = isHe ? 'כל יום' : 'Every';
  return { config, label: `${prefix} ${dayName} ב-${time}${template ? ` — "${template}"` : ''}` };
}

export function detectScheduleCommand(body: string, agentName: string): boolean {
  const stripped = body.replace(new RegExp(`@${agentName}`, 'gi'), '').trim();
  return /^(?:תקבע|תזכיר|תשלח|שלח)\s+כל\s+/i.test(stripped) || /^(?:schedule|remind|post)\s+every\s+/i.test(stripped);
}

export function detectUpcomingCommand(body: string, agentName: string): boolean {
  const stripped = body.replace(new RegExp(`@${agentName}`, 'gi'), '').trim();
  return /^(?:מה\s+מתוכנן|מה\s+יש\s+הקרוב|תוכנית\s+הקרובה|upcoming|what(?:'s|s)\s+(?:scheduled|planned|coming|next))[\s?？]?$/i.test(stripped);
}
