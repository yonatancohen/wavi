import type { CharacterConfig, SyncLastRun, SyncOpKey } from '@wavi/shared';
import { db } from '../db/client.js';
import { redis } from './redis.js';
import { emptySyncLastRun, mergeSyncLastRun, parseRecordedSyncRuns, redisSyncLastRunKey } from './sync-last-run.js';

export async function getRecordedSyncRuns(groupId: string): Promise<Partial<SyncLastRun>> {
  const raw = await redis.get(redisSyncLastRunKey(groupId));
  return parseRecordedSyncRuns(raw);
}

export async function recordSyncRun(groupId: string, keys: SyncOpKey | SyncOpKey[], at = new Date().toISOString()): Promise<void> {
  const list = Array.isArray(keys) ? keys : [keys];
  try {
    const current = { ...emptySyncLastRun(), ...(await getRecordedSyncRuns(groupId)) };
    for (const key of list) current[key] = at;
    await redis.set(redisSyncLastRunKey(groupId), JSON.stringify(current));
  } catch (err) {
    console.warn('[Sync] Failed to record last-run timestamp', err);
  }
}

async function latestIso(table: string, column: string, groupId: string): Promise<string | null> {
  const { data, error } = await db.from(table).select(column).eq('group_id', groupId).order(column, { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const value = (data as unknown as Record<string, unknown>)[column];
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

export async function inferSyncLastRun(groupId: string): Promise<Partial<SyncLastRun>> {
  const [profiles, dynamics, context, events, group] = await Promise.all([
    latestIso('user_profiles', 'last_updated', groupId),
    latestIso('relationship_map', 'last_updated', groupId),
    latestIso('group_contexts', 'generated_at', groupId),
    latestIso('group_events', 'created_at', groupId).catch(() => null),
    db.from('groups').select('character_config').eq('id', groupId).maybeSingle(),
  ]);

  const synthesizedAt = (group.data?.character_config as CharacterConfig | null | undefined)?.last_synthesized_at;
  const character = typeof synthesizedAt === 'string' && !Number.isNaN(Date.parse(synthesizedAt)) ? synthesizedAt : null;

  return {
    profiles,
    dynamics,
    context,
    sharpen: events,
    character,
  };
}

export async function getSyncLastRun(groupId: string): Promise<SyncLastRun> {
  const [recorded, inferred] = await Promise.all([getRecordedSyncRuns(groupId), inferSyncLastRun(groupId)]);
  return mergeSyncLastRun(recorded, inferred);
}
