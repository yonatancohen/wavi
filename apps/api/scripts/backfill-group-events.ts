/**
 * Extract durable events from existing episode summaries into group_events.
 *
 * Usage:
 *   bun run backfill:events
 *   bun run backfill:events -- --group-id <uuid>
 *   bun run backfill:events -- --name "אדיר"
 *   bun run backfill:events -- --all
 */

import { createClient } from '@supabase/supabase-js';
import { persistEpisodeEvents } from '../src/ai/group-events.js';
import { extractEventsFromSummary } from '../src/ai/summarizer.js';
import type { LanguageMode } from '@wavi/shared';

function parseArgs(argv: string[]) {
  const out = { groupId: null as string | null, name: null as string | null, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--group-id') out.groupId = argv[++i] ?? null;
    else if (a === '--name') out.name = argv[++i] ?? null;
    else if (a === '--all') out.all = true;
    else if (a === '--help' || a === '-h') return { help: true as const };
  }
  return out;
}

function requireEnv() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AGENT_ID', 'ANTHROPIC_API_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function resolveGroupId(db: Pick<ReturnType<typeof createClient>, 'from'>, args: { groupId: string | null; name: string | null }): Promise<string> {
  if (args.groupId) return args.groupId;

  if (args.name) {
    const { data, error } = await db.from('groups').select('id, name').eq('agent_id', process.env.AGENT_ID!).ilike('name', `%${args.name}%`);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; name: string }>;
    if (!rows.length) {
      console.error(`No group matching "${args.name}"`);
      process.exit(1);
    }
    if (rows.length > 1) {
      console.log('Multiple matches — use --group-id:\n');
      for (const g of rows) console.log(`  ${g.id}  ${g.name}`);
      process.exit(1);
    }
    return rows[0]!.id;
  }

  const { data, error } = await db.from('groups').select('id, name').eq('agent_id', process.env.AGENT_ID!).order('created_at', { ascending: false }).limit(2);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; name: string }>;
  if (!rows.length) {
    console.error('No groups found');
    process.exit(1);
  }
  if (rows.length > 1) {
    console.log('Multiple groups — pass --group-id or --name:\n');
    for (const g of rows) console.log(`  ${g.id}  ${g.name}`);
    process.exit(1);
  }
  return rows[0]!.id;
}

type EpisodeRow = { id: string; summary: string | null; msg_from: string | null };

async function backfillGroup(groupId: string): Promise<number> {
  const { data: group, error: groupError } = await db.from('groups').select('language_mode').eq('id', groupId).single();
  if (groupError || !group) throw new Error(groupError?.message ?? 'Group not found');

  const { data: episodes, error } = await db.from('episode_summaries').select('id, summary, msg_from').eq('group_id', groupId).order('msg_from', { ascending: true });
  if (error) throw error;

  const languageMode = ((group as { language_mode?: LanguageMode }).language_mode ?? 'he') as LanguageMode;
  let inserted = 0;

  for (const episode of (episodes ?? []) as EpisodeRow[]) {
    if (!episode.summary) continue;
    const events = await extractEventsFromSummary(episode.summary, languageMode, { groupId });
    if (events.length === 0) continue;
    await persistEpisodeEvents(groupId, episode.id, events, episode.msg_from);
    inserted += events.length;
    console.log(`  episode ${episode.id}: ${events.length} event(s)`);
  }

  return inserted;
}

const parsed = parseArgs(process.argv.slice(2));
if ('help' in parsed) {
  console.log('Usage: bun run backfill:events [--group-id UUID] [--name "partial"] [--all]');
  process.exit(0);
}

requireEnv();
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

if (parsed.all) {
  const { data, error } = await db.from('groups').select('id, name').eq('agent_id', process.env.AGENT_ID!).order('created_at', { ascending: false });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as Array<{ id: string; name: string }>;
  console.log(`Backfilling events for ${rows.length} group(s)…\n`);
  for (const g of rows) {
    console.log(`\n── ${g.name} (${g.id})`);
    try {
      const count = await backfillGroup(g.id);
      console.log(`  ${count} event(s) extracted`);
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log('\nAll done.');
} else {
  const groupId = await resolveGroupId(db, parsed);
  console.log(`Backfilling events for group ${groupId}…\n`);
  const count = await backfillGroup(groupId);
  console.log(`\nDone. ${count} event(s) extracted.`);
}
