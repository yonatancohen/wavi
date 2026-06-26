import type { AutomationConfig, AutomationType, DigestConfig, ScheduledPostConfig, SilenceNudgeConfig } from '@wavi/shared';

const GROUP_TIMEZONE = process.env.GROUP_TIMEZONE ?? 'Asia/Jerusalem';

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const hourRaw = parts.hour === '24' ? '0' : parts.hour;
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(hourRaw, 10),
    minute: parseInt(parts.minute, 10),
    weekday: WEEKDAY_MAP[parts.weekday] ?? 0,
  };
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(new Date(utc), timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    utc += desired - asUtc;
  }
  return new Date(utc);
}

function parseClockTime(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(':').map((part) => parseInt(part, 10));
  return { hour: hour || 0, minute: minute || 0 };
}

function computeScheduledNextFireAt(config: DigestConfig | ScheduledPostConfig, from: Date): Date {
  const tz = config.timezone ?? GROUP_TIMEZONE;
  const { hour: targetHour, minute: targetMinute } = parseClockTime(config.time ?? '09:00');
  const targetWeekday = config.weekday ?? 0;

  for (let offset = 0; offset < 14; offset++) {
    const probe = new Date(from.getTime() + offset * 86_400_000);
    const parts = getZonedParts(probe, tz);
    if (config.frequency === 'weekly' && parts.weekday !== targetWeekday) continue;

    const candidate = zonedTimeToUtc(parts.year, parts.month, parts.day, targetHour, targetMinute, tz);
    if (candidate > from) return candidate;
  }

  return new Date(from.getTime() + 86_400_000);
}

export function computeNextFireAt(type: AutomationType, config: AutomationConfig, from = new Date()): Date {
  if (type === 'silence_nudge') {
    const hours = (config as SilenceNudgeConfig).threshold_hours ?? 24;
    return new Date(from.getTime() + hours * 3_600_000);
  }

  return computeScheduledNextFireAt(config as DigestConfig | ScheduledPostConfig, from);
}

export function computeSilenceRearmAt(lastHumanMessageAt: Date | null, thresholdHours: number, from = new Date()): Date {
  if (!lastHumanMessageAt) return computeNextFireAt('silence_nudge', { threshold_hours: thresholdHours }, from);
  const fromSilence = new Date(lastHumanMessageAt.getTime() + thresholdHours * 3_600_000);
  return fromSilence > from ? fromSilence : computeNextFireAt('silence_nudge', { threshold_hours: thresholdHours }, from);
}
