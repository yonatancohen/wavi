/**
 * Rebuild relationship dynamics from stored messages without a full re-ingest.
 *
 * Usage:
 *   bun run rebuild:dynamics
 *   bun run rebuild:dynamics -- --group-id <uuid>
 *   bun run rebuild:dynamics -- --name "גוטלטיים"
 */

import { createClient } from '@supabase/supabase-js';
import { buildRelationshipMap } from '../src/ai/relationships.js';
import { resolveExportMessages, collectObservedAliasesByPerson } from '../src/lib/resolve-export-messages.js';
import type { LanguageMode, ParsedWAMessage } from '@wavi/shared';

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

const parsed = parseArgs(process.argv.slice(2));
if ('help' in parsed) {
  console.log('Usage: bun run rebuild:dynamics [--group-id UUID] [--name "partial"]');
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

const groupName = (group as { name: string; language_mode: string }).name;
const rawLang = (group as { name: string; language_mode: string }).language_mode ?? 'he';
const languageMode: LanguageMode = rawLang === 'auto' ? 'he' : (rawLang as LanguageMode);

console.log(`Rebuilding dynamics for "${groupName}" (${groupId}) [lang: ${languageMode}]…\n`);

const { data: rows, error: msgErr } = await db
  .from('messages')
  .select('sender_name, sender_wa_id, body, timestamp')
  .eq('group_id', groupId)
  .eq('is_agent_reply', false)
  .order('timestamp', { ascending: true });

if (msgErr) {
  console.error('Failed to fetch messages:', msgErr.message);
  process.exit(1);
}

if (!rows || rows.length === 0) {
  console.error('No stored messages — upload chat history first.');
  process.exit(1);
}

console.log(`Loaded ${rows.length} messages`);

const parsed2 = (rows as Array<{ sender_name: string; sender_wa_id: string | null; body: string; timestamp: string }>).map(
  (m): ParsedWAMessage => ({
    sender_name: m.sender_name,
    sender_wa_id: m.sender_wa_id ?? undefined,
    body: m.body,
    timestamp: new Date(m.timestamp),
    is_system_message: false,
    is_media_omitted: false,
  }),
);

const resolved = resolveExportMessages(parsed2).filter((m) => !m.is_system_message);
const observedAliases = collectObservedAliasesByPerson(resolved);

console.log(`Resolved ${resolved.length} real messages`);

const { data: before } = await db.from('relationship_map').select('id', { count: 'exact', head: true }).eq('group_id', groupId);
console.log(`Existing pairs: ${(before as unknown as { count: number } | null)?.count ?? 0}`);

await buildRelationshipMap(groupId, resolved, languageMode, observedAliases, { merge: true, pruneStale: true });

const { count } = await db.from('relationship_map').select('id', { count: 'exact', head: true }).eq('group_id', groupId);
console.log(`\nDone. Relationship pairs in DB: ${count ?? 0}`);
