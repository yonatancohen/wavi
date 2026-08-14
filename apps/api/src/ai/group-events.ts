import type { LanguageMode } from '@wavi/shared';
import { db } from '../db/client.js';
import type { ExtractedEvent } from './episode-events.js';
import { extractEventsFromSummary } from './summarizer.js';

export function isMissingGroupEventsTable(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? '';
  return msg.includes('group_events') && (msg.includes('schema cache') || msg.includes('does not exist') || error.code === 'PGRST205' || error.code === '42P01');
}

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
    if (isMissingGroupEventsTable(error)) throw error;
    console.error('[GroupEvents] persist failed:', error.message);
  }
}

export async function backfillGroupEvents(groupId: string): Promise<{ extracted: number; skipped: number }> {
  const { data: group, error: groupError } = await db.from('groups').select('language_mode').eq('id', groupId).single();
  if (groupError || !group) throw new Error(groupError?.message ?? 'Group not found');

  const { data: episodes, error } = await db.from('episode_summaries').select('id, summary, msg_from').eq('group_id', groupId).order('msg_from', { ascending: true });
  if (error) throw error;

  const { data: existing, error: existingError } = await db.from('group_events').select('source_episode_id').eq('group_id', groupId);
  if (existingError) throw existingError;

  const done = new Set((existing ?? []).map((row) => row.source_episode_id).filter(Boolean));
  const languageMode = ((group as { language_mode?: LanguageMode }).language_mode ?? 'he') as LanguageMode;
  let extracted = 0;
  let skipped = 0;

  for (const episode of episodes ?? []) {
    if (!episode.summary) continue;
    if (episode.id && done.has(episode.id)) {
      skipped++;
      continue;
    }
    const events = await extractEventsFromSummary(episode.summary, languageMode, { groupId });
    if (events.length === 0) continue;
    await persistEpisodeEvents(groupId, episode.id, events, episode.msg_from);
    extracted += events.length;
  }

  return { extracted, skipped };
}

export async function deleteGroupEvents(groupId: string): Promise<void> {
  const { error } = await db.from('group_events').delete().eq('group_id', groupId);
  if (error) {
    console.error('[GroupEvents] delete failed:', error.message);
  }
}
