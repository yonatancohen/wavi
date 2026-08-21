/** Group wall-clock helpers. Prefer GROUP_TIMEZONE so "today" is not UTC. */

export const DEFAULT_GROUP_TIMEZONE = process.env.GROUP_TIMEZONE ?? 'Asia/Jerusalem';

export type TimeLabelLang = 'he' | 'en';

function zonedParts(date: Date, timeZone: string): { year: string; month: string; day: string; hour: string; minute: string } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = (parts.hour === '24' ? '00' : (parts.hour ?? '00')).padStart(2, '0');
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour,
    minute: (parts.minute ?? '00').padStart(2, '0'),
  };
}

function ymdToUtcDays(year: string, month: string, day: string): number {
  return Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)) / 86_400_000;
}

export function formatNowInZone(now: Date, timeZone: string, lang: TimeLabelLang): string {
  return now.toLocaleString(lang === 'he' ? 'he-IL' : 'en-IL', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatRelativeMessageTime(at: Date | string, opts: { now?: Date; timeZone?: string; lang: TimeLabelLang }): string {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return '';

  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? DEFAULT_GROUP_TIMEZONE;
  const lang = opts.lang;
  const atParts = zonedParts(date, timeZone);
  const nowParts = zonedParts(now, timeZone);
  const hm = `${atParts.hour}:${atParts.minute}`;
  const dayDelta = ymdToUtcDays(nowParts.year, nowParts.month, nowParts.day) - ymdToUtcDays(atParts.year, atParts.month, atParts.day);

  if (dayDelta === 0) return lang === 'he' ? `היום ${hm}` : `today ${hm}`;
  if (dayDelta === 1) return lang === 'he' ? `אתמול ${hm}` : `yesterday ${hm}`;
  if (dayDelta > 1 && dayDelta < 7) {
    const weekday = date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { timeZone, weekday: 'long' });
    return `${weekday} ${hm}`;
  }

  const datePart = date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone, day: 'numeric', month: 'short' });
  return `${datePart} ${hm}`;
}
