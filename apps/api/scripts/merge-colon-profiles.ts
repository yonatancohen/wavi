/**
 * Merge phantom user_profiles created by the old parser bug (sender labels like
 * "Ohad: quote snippet") into the real member (prefix before first colon).
 *
 * Usage:
 *   bun scripts/merge-colon-profiles.ts -- --group-id <uuid>
 *   bun scripts/merge-colon-profiles.ts -- --name "Not fast"
 *   bun scripts/merge-colon-profiles.ts -- --group-id <uuid> --dry-run
 */

import { db } from '../src/db/client.js';
import { getProfileAliases } from '../src/lib/alias-store.js';
import { mergeAliases } from '../src/lib/identity.js';
import type { UserProfileData } from '@wavi/shared';

type ProfileRow = {
  id: string;
  group_id: string;
  wa_user_id: string;
  display_name: string;
  msg_count: number | null;
  profile_data: UserProfileData | null;
  behavioral_summary: string | null;
};

type RelationshipRow = {
  id: string;
  user_a_wa_id: string;
  user_b_wa_id: string;
  user_a_name: string | null;
  user_b_name: string | null;
  interaction_score: number | null;
  conflict_score: number | null;
  solidarity_score: number | null;
  signals: unknown;
  narrative: string | null;
};

function parseArgs(argv: string[]) {
  const out = { groupId: null as string | null, name: null as string | null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--group-id') out.groupId = argv[++i] ?? null;
    else if (a === '--name') out.name = argv[++i] ?? null;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--help' || a === '-h') return { help: true as const };
  }
  return out;
}

function requireEnv() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AGENT_ID'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function canonicalSenderName(label: string): string {
  const idx = label.indexOf(':');
  return (idx === -1 ? label : label.slice(0, idx)).trim();
}

function isColonPhantom(profile: ProfileRow): boolean {
  return profile.display_name.includes(':') || profile.wa_user_id.includes(':');
}

async function resolveGroupId(args: { groupId: string | null; name: string | null }): Promise<string> {
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
      console.error('Multiple groups match — use --group-id:');
      for (const row of rows) console.error(`  ${row.id}  ${row.name}`);
      process.exit(1);
    }
    return rows[0]!.id;
  }

  const { data, error } = await db.from('groups').select('id, name').eq('agent_id', process.env.AGENT_ID!);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; name: string }>;
  if (rows.length !== 1) {
    console.error('Pass --group-id or --name (more than one group exists).');
    process.exit(1);
  }
  return rows[0]!.id;
}

async function mergeProfiles(groupId: string, keep: ProfileRow, merge: ProfileRow, dryRun: boolean) {
  const keepData = (keep.profile_data ?? {}) as UserProfileData;
  const mergeData = (merge.profile_data ?? {}) as UserProfileData;
  const mergedAliases = mergeAliases(getProfileAliases(keepData), merge.display_name, merge.wa_user_id, ...getProfileAliases(mergeData));

  if (dryRun) {
    console.log(`  [dry-run] merge "${merge.display_name}" → "${keep.display_name}" (+${merge.msg_count ?? 0} msgs)`);
    return;
  }

  const { count: messageCount, error: msgCountErr } = await db.from('messages').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('sender_wa_id', merge.wa_user_id);
  if (msgCountErr) throw msgCountErr;

  if (messageCount && messageCount > 0) {
    const { error: msgErr } = await db.from('messages').update({ sender_wa_id: keep.wa_user_id, sender_name: keep.display_name }).eq('group_id', groupId).eq('sender_wa_id', merge.wa_user_id);
    if (msgErr) throw msgErr;
  }

  await db
    .from('user_profiles')
    .update({
      msg_count: (keep.msg_count ?? 0) + (merge.msg_count ?? 0),
      profile_data: { ...keepData, aliases: mergedAliases },
      last_updated: new Date().toISOString(),
    })
    .eq('id', keep.id);

  const oldId = merge.wa_user_id;
  const newId = keep.wa_user_id;
  const [{ data: relRowsA, error: relAErr }, { data: relRowsB, error: relBErr }] = await Promise.all([
    db.from('relationship_map').select('*').eq('group_id', groupId).eq('user_a_wa_id', oldId),
    db.from('relationship_map').select('*').eq('group_id', groupId).eq('user_b_wa_id', oldId),
  ]);
  if (relAErr) throw relAErr;
  if (relBErr) throw relBErr;
  const relRows = [...((relRowsA ?? []) as RelationshipRow[]), ...((relRowsB ?? []) as RelationshipRow[])].filter((row, idx, arr) => arr.findIndex((r) => r.id === row.id) === idx);

  for (const row of relRows) {
    let userA = row.user_a_wa_id === oldId ? newId : row.user_a_wa_id;
    let userB = row.user_b_wa_id === oldId ? newId : row.user_b_wa_id;
    if (userA === userB) {
      await db.from('relationship_map').delete().eq('id', row.id);
      continue;
    }
    let nameA = row.user_a_wa_id === oldId ? keep.display_name : row.user_a_name;
    let nameB = row.user_b_wa_id === oldId ? keep.display_name : row.user_b_name;
    if (userA > userB) {
      [userA, userB] = [userB, userA];
      [nameA, nameB] = [nameB, nameA];
    }
    await db.from('relationship_map').delete().eq('id', row.id);
    await db.from('relationship_map').upsert(
      {
        group_id: groupId,
        user_a_wa_id: userA,
        user_b_wa_id: userB,
        user_a_name: nameA,
        user_b_name: nameB,
        interaction_score: row.interaction_score,
        conflict_score: row.conflict_score,
        solidarity_score: row.solidarity_score,
        signals: row.signals,
        narrative: row.narrative,
        last_updated: new Date().toISOString(),
      },
      { onConflict: 'group_id,user_a_wa_id,user_b_wa_id' },
    );
  }

  const { error: delErr } = await db.from('user_profiles').delete().eq('id', merge.id);
  if (delErr) throw delErr;

  keep.msg_count = (keep.msg_count ?? 0) + (merge.msg_count ?? 0);
  keep.profile_data = { ...keepData, aliases: mergedAliases };

  console.log(`  merged "${merge.display_name}" → "${keep.display_name}" (${messageCount ?? 0} messages rewired)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if ('help' in args) {
    console.log(`Usage: bun scripts/merge-colon-profiles.ts -- [--group-id UUID | --name SUBSTRING] [--dry-run]`);
    process.exit(0);
  }

  requireEnv();
  const groupId = await resolveGroupId(args);

  const { data: group } = await db.from('groups').select('name').eq('id', groupId).single();
  const { data: profiles, error } = await db.from('user_profiles').select('*').eq('group_id', groupId);
  if (error) throw error;

  const rows = (profiles ?? []) as ProfileRow[];
  const canonicalByName = new Map<string, ProfileRow>();
  for (const row of rows) {
    if (!isColonPhantom(row)) canonicalByName.set(row.display_name, row);
  }

  const phantoms = rows.filter(isColonPhantom);
  const plan: Array<{ keep: ProfileRow; merge: ProfileRow }> = [];
  const unmapped: ProfileRow[] = [];

  for (const phantom of phantoms) {
    const canonName = canonicalSenderName(phantom.display_name);
    const keep = canonicalByName.get(canonName);
    if (!keep) {
      unmapped.push(phantom);
      continue;
    }
    plan.push({ keep, merge: phantom });
  }

  console.log(`Group: ${group?.name ?? groupId}`);
  console.log(`Profiles: ${rows.length} total, ${phantoms.length} colon phantoms, ${plan.length} to merge`);

  if (unmapped.length) {
    console.error('Could not map phantoms (no canonical profile):');
    for (const p of unmapped) console.error(`  ${p.display_name}`);
    process.exit(1);
  }

  if (!plan.length) {
    console.log('Nothing to merge.');
    return;
  }

  for (const { keep, merge } of plan) {
    await mergeProfiles(groupId, keep, merge, args.dryRun);
  }

  if (!args.dryRun) {
    const { count } = await db.from('user_profiles').select('id', { count: 'exact', head: true }).eq('group_id', groupId);
    console.log(`Done. ${count ?? '?'} profiles remaining.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
