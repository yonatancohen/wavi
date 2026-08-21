/** Time window for scheduled group recaps. Daily = last 24h, weekly = last 7 days. */

export const DIGEST_MESSAGE_LIMIT = 200;

const HOUR_MS = 60 * 60 * 1000;

export function digestLookbackMs(frequency: 'daily' | 'weekly'): number {
  return frequency === 'weekly' ? 7 * 24 * HOUR_MS : 24 * HOUR_MS;
}

export function digestSince(now: Date, frequency: 'daily' | 'weekly'): Date {
  return new Date(now.getTime() - digestLookbackMs(frequency));
}
