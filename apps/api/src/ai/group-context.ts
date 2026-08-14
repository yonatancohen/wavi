import type { LanguageMode } from '@wavi/shared';
import { db } from '../db/client.js';
import { generateGroupContext, MetaGroupContextError } from './summarizer.js';
import { isMissingGroupEventsTable } from './group-events.js';
import { isThinEpisodeSummary, usableGroupContext } from './context-quality.js';

export { MetaGroupContextError };

export class NoEpisodeSummariesError extends Error {
  constructor() {
    super('No episode summaries — run a full rebuild first.');
    this.name = 'NoEpisodeSummariesError';
  }
}

export class InsufficientHistoryError extends Error {
  constructor() {
    super('Not enough real chat history to build a summary — upload history or wait for more messages.');
    this.name = 'InsufficientHistoryError';
  }
}

export type ContextEventRow = {
  who: string[] | null;
  what: string;
  occurred_on: string | null;
  why_it_matters: string | null;
};

export function formatEventsForContext(events: ContextEventRow[]): string {
  return events
    .map((event) => {
      const who = (event.who ?? []).filter(Boolean).join(', ') || '?';
      const when = event.occurred_on ? ` (${event.occurred_on.slice(0, 10)})` : '';
      const why = event.why_it_matters ? ` — ${event.why_it_matters}` : '';
      return `- ${who}: ${event.what}${when}${why}`;
    })
    .join('\n');
}

export function formatLinesForContext(rows: Array<{ sender_name: string; body: string }>): string {
  return rows
    .map((row) => `${row.sender_name}: ${row.body}`.trim())
    .filter((line) => line.length > 2)
    .join('\n');
}

async function loadRecentEvents(groupId: string): Promise<string> {
  const { data, error } = await db
    .from('group_events')
    .select('who, what, occurred_on, why_it_matters')
    .eq('group_id', groupId)
    .order('occurred_on', { ascending: false, nullsFirst: false })
    .limit(12);

  if (error) {
    if (isMissingGroupEventsTable(error)) return '';
    console.warn('[GroupContext] events fetch failed:', error.message);
    return '';
  }

  return formatEventsForContext((data ?? []) as ContextEventRow[]);
}

async function loadRecentLines(groupId: string): Promise<string> {
  const { data, error } = await db.from('messages').select('sender_name, body').eq('group_id', groupId).eq('is_agent_reply', false).order('timestamp', { ascending: false }).limit(80);

  if (error) {
    console.warn('[GroupContext] messages fetch failed:', error.message);
    return '';
  }

  return formatLinesForContext(((data ?? []) as Array<{ sender_name: string; body: string }>).reverse());
}

export async function rebuildGroupContext(params: { groupId: string; groupName: string; languageMode: LanguageMode }): Promise<{ summary_text: string; generated_at: string }> {
  const { groupId, groupName, languageMode } = params;

  const { data: episodes } = await db.from('episode_summaries').select('summary').eq('group_id', groupId).order('created_at', { ascending: false }).limit(10);

  const usableEpisodes = ((episodes ?? []) as Array<{ summary: string }>).map((episode) => episode.summary).filter((summary) => summary && !isThinEpisodeSummary(summary));

  const recentLines = await loadRecentLines(groupId);
  const recentEvents = await loadRecentEvents(groupId);

  if (usableEpisodes.length === 0 && !recentLines && !recentEvents) {
    if (!episodes || episodes.length === 0) throw new NoEpisodeSummariesError();
    throw new InsufficientHistoryError();
  }

  const recentContent = usableEpisodes.reverse().join('\n\n');
  const { data: prevCtx } = await db.from('group_contexts').select('summary_text').eq('group_id', groupId).order('generated_at', { ascending: false }).limit(1).maybeSingle();

  const summaryText = await generateGroupContext({
    groupName,
    recentContent,
    previousContext: usableGroupContext((prevCtx as { summary_text: string } | null)?.summary_text),
    recentEvents,
    recentLines,
    languageMode,
    usageContext: { groupId },
  });

  const { data: inserted, error } = await db.from('group_contexts').insert({ group_id: groupId, summary_text: summaryText, character_version: 1 }).select('summary_text, generated_at').single();
  if (error) throw error;

  return {
    summary_text: (inserted as { summary_text: string } | null)?.summary_text ?? summaryText,
    generated_at: (inserted as { generated_at: string } | null)?.generated_at ?? new Date().toISOString(),
  };
}
