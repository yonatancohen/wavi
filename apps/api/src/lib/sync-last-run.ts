import type { SyncLastRun } from '@wavi/shared';
import { SYNC_OP_KEYS } from '@wavi/shared';

export function emptySyncLastRun(): SyncLastRun {
  return {
    sharpen: null,
    chunkDates: null,
    dynamics: null,
    profiles: null,
    context: null,
    character: null,
  };
}

export function parseRecordedSyncRuns(raw: unknown): Partial<SyncLastRun> {
  if (raw == null) return {};
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object') return {};

  const out: Partial<SyncLastRun> = {};
  for (const key of SYNC_OP_KEYS) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
      out[key] = value;
    }
  }
  return out;
}

export function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export function mergeSyncLastRun(recorded: Partial<SyncLastRun>, inferred: Partial<SyncLastRun>): SyncLastRun {
  const merged = emptySyncLastRun();
  for (const key of SYNC_OP_KEYS) {
    merged[key] = laterIso(recorded[key], inferred[key]);
  }
  return merged;
}

export function redisSyncLastRunKey(groupId: string) {
  return `sync_last_run:${groupId}`;
}
