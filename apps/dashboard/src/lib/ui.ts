import type { GroupStatus, GroupWithStats } from '@wavi/shared';

export function normalizeGroupWithStats(group: GroupWithStats): GroupWithStats {
  return {
    ...group,
    web_search_enabled: group.web_search_enabled ?? false,
    profile_count: group.profile_count ?? 0,
    message_count_today: group.message_count_today ?? 0,
    reply_count_today: group.reply_count_today ?? 0,
  };
}

export function statusLabel(status: GroupStatus, t?: (key: string) => string): string {
  if (t) return t(`status_label.${status}`);
  if (status === 'active') return 'Live';
  if (status === 'paused') return 'Paused';
  return 'Setup';
}

export function draftLabel(t?: (key: string) => string): string {
  return t ? t('status_label.draft') : 'Draft';
}

export function statusBadgeClass(status: GroupStatus) {
  const map: Record<GroupStatus, string> = {
    active: 'bg-primary/10 text-primary border border-primary/20',
    pending_setup: 'bg-secondary/10 text-secondary border border-secondary/20',
    paused: 'bg-error/10 text-error border border-error/20',
  };
  return map[status];
}

export function draftBadgeClass() {
  return 'bg-tertiary/10 text-tertiary border border-tertiary/20';
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
