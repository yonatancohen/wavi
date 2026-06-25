/**
 * Re-generate the group context summary using the current generateGroupContext prompt.
 * Use this after prompt changes to refresh BLOCK 5 without a full rebuild.
 *
 * Usage:
 *   bun run regenerate:group-context
 *   bun run regenerate:group-context -- --group-id <uuid>
 *   bun run regenerate:group-context -- --name "אדיר"
 */

import { createClient } from '@supabase/supabase-js';
import type { LanguageMode } from '@wavi/shared';
import { generateGroupContext } from '../src/ai/summarizer.js';

function parseArgs(argv: string[]) {
  const out = { groupId: null as string | null, name: null as string | null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--group-id') out.groupId = argv[++i] ?? null;
    else if (a === '--name') out.name = argv[++i] ?? null;
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

function resolveEffectiveLang(mode: string): LanguageMode {
  return (mode === 'auto' ? 'he' : mode) as LanguageMode;
}

async function resolveGroupId(db: ReturnType<typeof createClient>, args: { groupId: string | null; name: string | null }): Promise<string> {
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

const parsed = parseArgs(process.argv.slice(2));
if ('help' in parsed) {
  console.log('Usage: bun run regenerate:group-context [--group-id UUID] [--name "partial"]');
  process.exit(0);
}

requireEnv();
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const groupId = await resolveGroupId(db, parsed);

const { data: group, error: groupErr } = await db.from('groups').select('name, language_mode').eq('id', groupId).single();
if (groupErr || !group) {
  console.error('Group not found');
  process.exit(1);
}

const languageMode = resolveEffectiveLang((group as { name: string; language_mode: string }).language_mode ?? 'he');
const groupName = (group as { name: string; language_mode: string }).name;

console.log(`Regenerating group context for "${groupName}" (${groupId}) [lang: ${languageMode}]…\n`);

// Pull the 5 most recent episode summaries as source material
const { data: episodes } = await db.from('episode_summaries').select('summary').eq('group_id', groupId).order('created_at', { ascending: false }).limit(5);

const recentContent = ((episodes ?? []) as Array<{ summary: string }>)
  .reverse()
  .map((e) => e.summary)
  .join('\n\n');

if (!recentContent) {
  console.error('No episode summaries found — run a full ingest first.');
  process.exit(1);
}

// Load the previous context as anchor
const { data: prevCtx } = await db.from('group_contexts').select('summary_text').eq('group_id', groupId).order('generated_at', { ascending: false }).limit(1).maybeSingle();

const contextSummary = await generateGroupContext({
  groupName,
  recentContent,
  previousContext: (prevCtx as { summary_text: string } | null)?.summary_text ?? '',
  languageMode,
  usageContext: { groupId },
});

const { error: insertErr } = await db.from('group_contexts').insert({
  group_id: groupId,
  summary_text: contextSummary,
  character_version: 1,
});

if (insertErr) {
  console.error('Failed to save:', insertErr.message);
  process.exit(1);
}

console.log('Done.\n');
console.log('New group context:\n');
console.log(contextSummary);
