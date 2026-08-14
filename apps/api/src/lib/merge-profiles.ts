import { db } from '../db/client.js';
import { getProfileAliases } from './alias-store.js';
import { planDuplicateNameMerges } from './duplicate-profiles.js';
import { mergeAliases } from './identity.js';
import type { UserProfileData } from '@wavi/shared';

export type ProfileMergeRow = {
  id: string;
  group_id: string;
  wa_user_id: string;
  display_name: string;
  msg_count: number | null;
  profile_data: UserProfileData | null;
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

export type { DuplicateMergePlan, DuplicateMergePlanItem, DuplicateMergeAmbiguous } from './duplicate-profiles.js';

/** Fold `merge` into `keep`: aliases, msg_count, messages, relationships, then delete merge. */
export async function mergeProfileInto(groupId: string, keep: ProfileMergeRow, merge: ProfileMergeRow): Promise<ProfileMergeRow> {
  const keepData = (keep.profile_data ?? {}) as UserProfileData;
  const mergeData = (merge.profile_data ?? {}) as UserProfileData;
  const mergedAliases = mergeAliases(getProfileAliases(keepData), merge.display_name, merge.wa_user_id, ...getProfileAliases(mergeData));
  const nextMsgCount = (keep.msg_count ?? 0) + (merge.msg_count ?? 0);
  const nextProfileData = { ...keepData, aliases: mergedAliases };

  const { count: messageCount, error: msgCountErr } = await db.from('messages').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('sender_wa_id', merge.wa_user_id);
  if (msgCountErr) throw msgCountErr;

  if (messageCount && messageCount > 0) {
    const { error: msgErr } = await db.from('messages').update({ sender_wa_id: keep.wa_user_id, sender_name: keep.display_name }).eq('group_id', groupId).eq('sender_wa_id', merge.wa_user_id);
    if (msgErr) throw msgErr;
  }

  const { error: updErr } = await db
    .from('user_profiles')
    .update({
      msg_count: nextMsgCount,
      profile_data: nextProfileData,
      last_updated: new Date().toISOString(),
    })
    .eq('id', keep.id)
    .eq('group_id', groupId);
  if (updErr) throw updErr;

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

  const { error: delErr } = await db.from('user_profiles').delete().eq('id', merge.id).eq('group_id', groupId);
  if (delErr) throw delErr;

  return {
    ...keep,
    msg_count: nextMsgCount,
    profile_data: nextProfileData,
  };
}

export async function mergeDuplicateNameProfiles(
  groupId: string,
  options: { force?: boolean; dryRun?: boolean } = {},
): Promise<ReturnType<typeof planDuplicateNameMerges> & { merged: number; remaining_profiles: number | null }> {
  const { data: profiles, error } = await db.from('user_profiles').select('*').eq('group_id', groupId);
  if (error) throw error;

  const rows = (profiles ?? []) as ProfileMergeRow[];
  const plan = planDuplicateNameMerges(rows, { force: options.force });

  if (options.dryRun || !plan.merges.length) {
    const { count } = await db.from('user_profiles').select('id', { count: 'exact', head: true }).eq('group_id', groupId);
    return { ...plan, merged: 0, remaining_profiles: count ?? rows.length };
  }

  // Keep a mutable map so chained merges into the same keep profile accumulate correctly
  const byId = new Map(rows.map((r) => [r.id, r]));

  let merged = 0;
  for (const item of plan.merges) {
    const keep = byId.get(item.keep_profile_id);
    const merge = byId.get(item.merge_profile_id);
    if (!keep || !merge) continue;
    const updated = await mergeProfileInto(groupId, keep, merge);
    byId.set(keep.id, updated);
    byId.delete(merge.id);
    merged += 1;
  }

  const { count } = await db.from('user_profiles').select('id', { count: 'exact', head: true }).eq('group_id', groupId);
  return { ...plan, merged, remaining_profiles: count ?? byId.size };
}
