import { db } from '../db/client.js';
import type { ExtractedEvent } from './episode-events.js';

function whatKey(what: string): string {
  return what.slice(0, 40).toLowerCase();
}

function parseOccurredOn(when: string | undefined, fallback: string | null | undefined): string | null {
  if (when) {
    const parsed = Date.parse(when);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  if (!fallback) return null;
  const parsed = Date.parse(fallback);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export async function persistEpisodeEvents(groupId: string, sourceEpisodeId: string | null, events: ExtractedEvent[], occurredOn?: string | null): Promise<void> {
  if (events.length === 0) return;

  let toInsert = events;
  if (sourceEpisodeId) {
    const { data: existing } = await db.from('group_events').select('what').eq('group_id', groupId).eq('source_episode_id', sourceEpisodeId);
    const seen = new Set((existing ?? []).map((row) => whatKey(row.what)));
    toInsert = events.filter((event) => !seen.has(whatKey(event.what)));
  }

  if (toInsert.length === 0) return;

  const { error } = await db.from('group_events').insert(
    toInsert.map((event) => ({
      group_id: groupId,
      who: event.who,
      what: event.what,
      occurred_on: parseOccurredOn(event.when, occurredOn),
      why_it_matters: event.why_it_matters ?? null,
      source_episode_id: sourceEpisodeId,
    })),
  );

  if (error) {
    console.error('[GroupEvents] persist failed:', error.message);
  }
}

export async function deleteGroupEvents(groupId: string): Promise<void> {
  const { error } = await db.from('group_events').delete().eq('group_id', groupId);
  if (error) {
    console.error('[GroupEvents] delete failed:', error.message);
  }
}
