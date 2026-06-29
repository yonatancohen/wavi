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

export function parseScheduleCommand(body: string, agentName: string): ParsedSchedule | null {
  const stripped = body.replace(new RegExp(`@${agentName}`, 'gi'), '').trim();

  const heWeekly = stripped.match(/^(?:תקבע|תזכיר|תשלח|שלח)\s+כל\s+(\S+)\s+ב-?([\d:.]+(?:am|pm)?)\s*(.*)$/i);
  const enWeekly = stripped.match(/^(?:schedule|remind|post)\s+every\s+(\w+)\s+at\s+([\d:.]+(?:am|pm)?)\s*(.*)$/i);

  const heDaily = stripped.match(/^(?:תקבע|תזכיר|תשלח|שלח)\s+כל\s+יום\s+ב-?([\d:.]+(?:am|pm)?)\s*(.*)$/i);
  const enDaily = stripped.match(/^(?:schedule|remind|post)\s+every\s+day\s+at\s+([\d:.]+(?:am|pm)?)\s*(.*)$/i);

  if (heWeekly) {
    const dayNum = parseDayOfWeek(heWeekly[1]);
    const time = parseTime(heWeekly[2]);
    if (dayNum === null || !time) return null;
    const template = heWeekly[3].trim() || undefined;
    const config: ScheduledPostConfig = {
      frequency: 'weekly',
      weekday: dayNum,
      time,
      timezone: TIMEZONE,
      ...(template ? { template } : {}),
    };
    const dayName = DAY_NAMES_HE[dayNum] ?? heWeekly[1];
    return { config, label: `כל יום ${dayName} ב-${time}${template ? ` — "${template}"` : ''}` };
  }

  if (enWeekly) {
    const dayNum = parseDayOfWeek(enWeekly[1]);
    const time = parseTime(enWeekly[2]);
    if (dayNum === null || !time) return null;
    const template = enWeekly[3].trim() || undefined;
    const config: ScheduledPostConfig = {
      frequency: 'weekly',
      weekday: dayNum,
      time,
      timezone: TIMEZONE,
      ...(template ? { template } : {}),
    };
    const dayName = DAY_NAMES_EN[dayNum] ?? enWeekly[1];
    return { config, label: `Every ${dayName} at ${time}${template ? ` — "${template}"` : ''}` };
  }

  if (heDaily) {
    const time = parseTime(heDaily[1]);
    if (!time) return null;
    const template = heDaily[2].trim() || undefined;
    const config: ScheduledPostConfig = {
      frequency: 'daily',
      time,
      timezone: TIMEZONE,
      ...(template ? { template } : {}),
    };
    return { config, label: `כל יום ב-${time}${template ? ` — "${template}"` : ''}` };
  }

  if (enDaily) {
    const time = parseTime(enDaily[1]);
    if (!time) return null;
    const template = enDaily[2].trim() || undefined;
    const config: ScheduledPostConfig = {
      frequency: 'daily',
      time,
      timezone: TIMEZONE,
      ...(template ? { template } : {}),
    };
    return { config, label: `Every day at ${time}${template ? ` — "${template}"` : ''}` };
  }

  return null;
}

export function detectScheduleCommand(body: string, agentName: string): boolean {
  const stripped = body.replace(new RegExp(`@${agentName}`, 'gi'), '').trim();
  return /^(?:תקבע|תזכיר|תשלח|שלח)\s+כל\s+/i.test(stripped) || /^(?:schedule|remind|post)\s+every\s+/i.test(stripped);
}

export function detectUpcomingCommand(body: string, agentName: string): boolean {
  const stripped = body.replace(new RegExp(`@${agentName}`, 'gi'), '').trim();
  return /^(?:מה\s+מתוכנן|מה\s+יש\s+הקרוב|תוכנית\s+הקרובה|upcoming|what(?:'s|s)\s+(?:scheduled|planned|coming|next))[\s?？]?$/i.test(stripped);
}
