import type { AgentStatusResponse } from '@wavi/shared';

export type AgentHealthTier = 'offline' | 'connecting' | 'healthy' | 'degraded';

export function resolveAgentHealthTier(status: AgentStatusResponse | null): AgentHealthTier {
  if (!status) return 'offline';

  if (status.connected) {
    const h = status.health;
    if (h.restart_in_progress || h.consecutive_cdp_failures > 0 || (h.cdp_op_in_flight && h.cdp_op_stuck_ms >= 10_000)) {
      return 'degraded';
    }
    return 'healthy';
  }

  if (status.connecting) return 'connecting';
  return 'offline';
}

export function formatStuckDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

export function formatRelativeTime(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}
