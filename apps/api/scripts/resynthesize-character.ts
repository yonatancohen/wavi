/**
 * Re-synthesize character_config (voice, opinions, signature) from stored summaries.
 *
 * Usage:
 *   bun run resynthesize:character
 *   bun run resynthesize:character -- --group-id <uuid>
 *   bun run resynthesize:character -- --name "אדיר"
 *   bun run resynthesize:character -- --all
 */

import { createClient } from '@supabase/supabase-js';
import { synthesizeCharacterForGroup } from '../src/ai/character-synthesis.js';

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

const parsed = parseArgs(process.argv.slice(2));
if ('help' in parsed) {
  console.log('Usage: bun run resynthesize:character [--group-id UUID] [--name "partial"] [--all]');
  process.exit(0);
}

requireEnv();
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function printResult(config: Awaited<ReturnType<typeof synthesizeCharacterForGroup>>) {
  console.log('Voice:', config.voice);
  console.log('Signature:', config.signature_behavior);
  console.log('Opinions:');
  for (const o of config.opinions) console.log(`  · ${o}`);
  console.log(`Examples: ${config.examples?.length ?? 0}`);
}

if (parsed.all) {
  const { data, error } = await db.from('groups').select('id, name').eq('agent_id', process.env.AGENT_ID!).order('created_at', { ascending: false });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as Array<{ id: string; name: string }>;
  if (!rows.length) {
    console.error('No groups found');
    process.exit(1);
  }

  console.log(`Re-synthesizing ${rows.length} group(s)…\n`);
  for (const g of rows) {
    console.log(`\n── ${g.name} (${g.id})`);
    try {
      const config = await synthesizeCharacterForGroup(g.id);
      printResult(config);
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log('\nAll done.');
} else {
  const groupId = await resolveGroupId(db, parsed);
  console.log(`Re-synthesizing character for group ${groupId}…\n`);
  const config = await synthesizeCharacterForGroup(groupId);
  console.log('Done.\n');
  printResult(config);
}
