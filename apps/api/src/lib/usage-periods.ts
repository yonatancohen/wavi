export function getDayStartUtc(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Calendar week starting Sunday 00:00 UTC. */
export function getWeekStartSundayUtc(date = new Date()): Date {
  const dayStart = getDayStartUtc(date);
  const weekday = dayStart.getUTCDay();
  dayStart.setUTCDate(dayStart.getUTCDate() - weekday);
  return dayStart;
}

export function getMonthStartUtc(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function dayKey(date = new Date()): string {
  return getDayStartUtc(date).toISOString().slice(0, 10);
}

export function weekKey(date = new Date()): string {
  return `w${getWeekStartSundayUtc(date).toISOString().slice(0, 10)}`;
}

export function monthKey(date = new Date()): string {
  return getMonthStartUtc(date).toISOString().slice(0, 7);
}
