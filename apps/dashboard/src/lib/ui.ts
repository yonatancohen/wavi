import type { GroupStatus } from '@wavi/shared'

export function statusLabel(status: GroupStatus) {
  if (status === 'active') return 'Live'
  if (status === 'paused') return 'Paused'
  return 'Setup'
}

export function statusBadgeClass(status: GroupStatus) {
  const map: Record<GroupStatus, string> = {
    active: 'bg-wa/10 text-wa',
    pending_setup: 'bg-warn/10 text-warn',
    paused: 'bg-danger/10 text-danger',
  }
  return map[status]
}
