import type { GroupStatus } from '@wavi/shared';

export function statusLabel(status: GroupStatus, t?: (key: string) => string): string {
  if (t) return t(`status_label.${status}`);
  if (status === 'active') return 'Live';
  if (status === 'paused') return 'Paused';
  return 'Setup';
}

export function statusBadgeClass(status: GroupStatus) {
  const map: Record<GroupStatus, string> = {
    active: 'bg-primary/10 text-primary border border-primary/20',
    pending_setup: 'bg-secondary/10 text-secondary border border-secondary/20',
    paused: 'bg-error/10 text-error border border-error/20',
  };
  return map[status];
}

export function formatRelativeTime(iso: string, locale = 'en'): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  const rtf = new Intl.RelativeTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', { numeric: 'auto' });

  if (seconds < 60) return rtf.format(0, 'second');
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  if (hours < 24) return rtf.format(-hours, 'hour');
  if (days < 7) return rtf.format(-days, 'day');
  if (weeks < 5) return rtf.format(-weeks, 'week');
  return date.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US');
}
