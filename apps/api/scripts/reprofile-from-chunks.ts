/**
 * Re-run member profiling from stored message_chunks (when messages table is sparse).
 *
 * Usage:
 *   bun run reprofile-from-chunks -- --group-id <uuid>
 *   bun run reprofile-from-chunks -- --group-id <uuid> --only-empty
 */

import { createClient } from '@supabase/supabase-js';
import { buildUserProfilesFromHistory } from '../src/ai/profiler.js';
import { namesLikelyMatch } from '../src/lib/identity.js';
import { isPlaceholderProfileSummary } from '../src/lib/profile-fallback.js';
import { collectObservedAliasesByPerson, type ResolvedExportMessage } from '../src/lib/resolve-export-messages.js';
import type { LanguageMode, UserProfileData } from '@wavi/shared';

const CHUNK_PAGE = 500;
const CONTENT_LINE = /^(.+?): (.+)$/;

type ProfileRow = {
  wa_user_id: string;
  display_name: string;
  behavioral_summary: string | null;
  profile_data: UserProfileData | null;
};

function parseArgs(argv: string[]) {
  const out = { groupId: null as string | null, onlyEmpty: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--group-id') out.groupId = argv[++i] ?? null;
    else if (a === '--only-empty') out.onlyEmpty = true;
    else if (a === '--help' || a === '-h') return { help: true as const };
  }
  return out;
}

function usage() {
  console.log(`Usage: bun run reprofile-from-chunks -- --group-id <uuid> [--only-empty]

Loads apps/api/.env. Rebuilds behavioral_summary + profile_data from message_chunks.
`);
}

function profileMatchesLabel(profile: ProfileRow, label: string): boolean {
  if (namesLikelyMatch(label, profile.display_name)) return true;
  if (namesLikelyMatch(label, profile.wa_user_id)) return true;
  for (const alias of profile.profile_data?.aliases ?? []) {
    if (namesLikelyMatch(label, alias)) return true;
  }
  return false;
}

function resolveProfile(profiles: ProfileRow[], senderLabel: string): ProfileRow | null {
  return profiles.find((p) => profileMatchesLabel(p, senderLabel)) ?? null;
}

async function fetchAllChunks(db: ReturnType<typeof createClient>, groupId: string) {
  const rows: Array<{ content: string | null }> = [];
  let from = 0;

  while (true) {
    const { data, error } = await db
      .from('message_chunks')
      .select('content')
      .eq('group_id', groupId)
      .order('msg_from', { ascending: true })
      .range(from, from + CHUNK_PAGE - 1);

    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < CHUNK_PAGE) break;
    from += CHUNK_PAGE;
  }

  return rows;
}

function messagesFromChunks(profiles: ProfileRow[], chunks: Array<{ content: string | null }>): ResolvedExportMessage[] {
  const messages: ResolvedExportMessage[] = [];
  let seq = 0;

  for (const chunk of chunks) {
    const content = chunk.content ?? '';
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = CONTENT_LINE.exec(trimmed);
      if (!match) continue;

      const senderLabel = match[1].trim();
      const body = match[2].trim();
      if (!body) continue;

      const profile = resolveProfile(profiles, senderLabel);
      if (!profile) continue;

      messages.push({
        timestamp: new Date(seq++),
        sender_wa_id: profile.wa_user_id,
        sender_name: profile.display_name,
        body,
        is_system_message: false,
        is_media_omitted: false,
        observed_labels: [],
      });
    }
  }

  return messages;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if ('help' in args || !args.groupId) {
    usage();
    process.exit('help' in args ? 0 : 1);
  }

  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: group, error: groupErr } = await db.from('groups').select('name, language_mode').eq('id', args.groupId).single();
  if (groupErr || !group) {
    console.error('Group not found:', groupErr?.message ?? args.groupId);
    process.exit(1);
  }

  let { data: profiles } = await db.from('user_profiles').select('wa_user_id, display_name, behavioral_summary, profile_data').eq('group_id', args.groupId);

  if (args.onlyEmpty) {
    profiles = (profiles ?? []).filter((p) => isPlaceholderProfileSummary(p.behavioral_summary));
  }

  const profileRows = (profiles ?? []) as ProfileRow[];
  if (!profileRows.length) {
    console.log('No profiles to update.');
    return;
  }

  console.log(`Group: ${group.name} (${args.groupId})`);
  console.log(`Profiling ${profileRows.length} member(s) from message_chunks…`);

  const chunks = await fetchAllChunks(db, args.groupId);
  console.log(`Loaded ${chunks.length} chunks`);

  const messages = messagesFromChunks(profileRows, chunks);
  console.log(`Parsed ${messages.length} message lines for target members`);

  const byUser = new Map<string, number>();
  for (const m of messages) byUser.set(m.sender_wa_id, (byUser.get(m.sender_wa_id) ?? 0) + 1);
  for (const p of profileRows) {
    console.log(`  ${p.display_name}: ${byUser.get(p.wa_user_id) ?? 0} messages`);
  }

  const languageMode = (group.language_mode ?? 'he') as LanguageMode;
  const observedAliases = collectObservedAliasesByPerson(messages);
  const targetIds = new Set(profileRows.map((p) => p.wa_user_id));
  const filtered = messages.filter((m) => targetIds.has(m.sender_wa_id));

  await buildUserProfilesFromHistory(args.groupId, filtered, languageMode, observedAliases, { merge: true });

  const { data: after } = await db
    .from('user_profiles')
    .select('display_name, behavioral_summary')
    .eq('group_id', args.groupId)
    .in(
      'wa_user_id',
      profileRows.map((p) => p.wa_user_id),
    );

  console.log('\nResults:');
  for (const row of after ?? []) {
    const summary = row.behavioral_summary?.trim();
    console.log(`  ${row.display_name}: ${summary ? summary.slice(0, 80) + (summary.length > 80 ? '…' : '') : '(still empty)'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
