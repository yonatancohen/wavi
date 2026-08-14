/**
 * Merge same-display-name user_profiles duplicates (export label vs live phone id).
 *
 * Keeps the phone-like wa_user_id when present; otherwise highest msg_count.
 *
 * Usage:
 *   bun scripts/merge-duplicate-profiles.ts -- --name "אדירים" --dry-run
 *   bun scripts/merge-duplicate-profiles.ts -- --name "אדירים"
 *   bun scripts/merge-duplicate-profiles.ts -- --group-id <uuid> --force
 */
import { db } from '../src/db/client.js';
import { getProfileAliases } from '../src/lib/alias-store.js';
import { groupProfilesByNormalizedName, isPhoneLikeWaUserId, pickKeepProfile } from '../src/lib/duplicate-profiles.js';
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
  const out = {
    groupId: null as string | null,
    name: null as string | null,
    dryRun: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--group-id') out.groupId = argv[++i] ?? null;
    else if (a === '--name') out.name = argv[++i] ?? null;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
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
    console.log(`  [dry-run] keep ${keep.wa_user_id} (${keep.msg_count ?? 0} msgs) ← merge ${merge.wa_user_id} (${merge.msg_count ?? 0} msgs)`);
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

  console.log(`  merged ${merge.wa_user_id} → ${keep.wa_user_id} (${messageCount ?? 0} messages rewired)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if ('help' in args) {
    console.log(`Usage: bun scripts/merge-duplicate-profiles.ts -- [--group-id UUID | --name SUBSTRING] [--dry-run] [--force]`);
    process.exit(0);
  }

  requireEnv();
  const groupId = await resolveGroupId(args);

  const { data: group } = await db.from('groups').select('name').eq('id', groupId).single();
  const { data: profiles, error } = await db.from('user_profiles').select('*').eq('group_id', groupId);
  if (error) throw error;

  const rows = (profiles ?? []) as ProfileRow[];
  const byName = groupProfilesByNormalizedName(rows);

  const plan: Array<{ name: string; keep: ProfileRow; merge: ProfileRow }> = [];
  const ambiguous: Array<{ name: string; phones: ProfileRow[] }> = [];
  let singletonCount = 0;

  for (const [name, cluster] of byName) {
    if (cluster.length < 2) {
      singletonCount += 1;
      continue;
    }
    const picked = pickKeepProfile(cluster, { force: args.force });
    if (!picked) continue;
    if ('ambiguous' in picked) {
      ambiguous.push({ name, phones: picked.phones });
      continue;
    }
    for (const merge of picked.merge) {
      plan.push({ name, keep: picked.keep, merge });
    }
  }

  console.log(`Group: ${group?.name ?? groupId}`);
  console.log(`Profiles: ${rows.length} total, ${byName.size} unique names, ${singletonCount} unique people, ${plan.length} merge(s) planned`);

  if (ambiguous.length) {
    console.warn('Skipped ambiguous clusters (2+ phone ids, same display name). Re-run with --force to keep highest msg_count:');
    for (const a of ambiguous) {
      console.warn(`  "${a.name}": ${a.phones.map((p) => `${p.wa_user_id}(${p.msg_count ?? 0})`).join(', ')}`);
    }
  }

  if (!plan.length) {
    console.log(args.dryRun ? 'Nothing to merge (dry-run).' : 'Nothing to merge.');
    return;
  }

  let currentName = '';
  for (const item of plan) {
    if (item.name !== currentName) {
      currentName = item.name;
      const keepKind = isPhoneLikeWaUserId(item.keep.wa_user_id) ? 'phone' : 'label';
      console.log(`\n"${item.keep.display_name}" → keep ${keepKind} id ${item.keep.wa_user_id}`);
    }
    await mergeProfiles(groupId, item.keep, item.merge, args.dryRun);
  }

  if (!args.dryRun) {
    const { count } = await db.from('user_profiles').select('id', { count: 'exact', head: true }).eq('group_id', groupId);
    console.log(`\nDone. ${count ?? '?'} profiles remaining.`);
  } else {
    console.log('\nDry-run only — re-run without --dry-run to apply.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
