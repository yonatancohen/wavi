import type { GroupStatus } from '@wavi/shared'

export function statusLabel(status: GroupStatus) {
  if (status === 'active') return 'Live'
  if (status === 'paused') return 'Paused'
  return 'Setup'
}

export function statusBadgeClass(status: GroupStatus) {
  const map: Record<GroupStatus, string> = {
    active: 'bg-primary/10 text-primary border border-primary/20',
    pending_setup: 'bg-secondary/10 text-secondary border border-secondary/20',
    paused: 'bg-error/10 text-error border border-error/20',
  }
  return map[status]
}

export function formatRelativeTime(iso: string) {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}
