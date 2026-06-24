import { db } from '../db/client.js';
import { mergeProfileFromIngest, type UserProfileUpsertRow } from './profile-merge.js';

export type { UserProfileUpsertRow } from './profile-merge.js';

export type UpsertUserProfileOptions = {
  /** When true, merge aliases and preserve dashboard-locked fields instead of replacing. */
  merge?: boolean;
};

/** Insert or update a profile for one group. Never reassigns rows across groups. */
export async function upsertUserProfile(row: UserProfileUpsertRow, options: UpsertUserProfileOptions = {}): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from('user_profiles')
    .select('id, display_name, behavioral_summary, profile_data, msg_count')
    .eq('group_id', row.group_id)
    .eq('wa_user_id', row.wa_user_id)
    .maybeSingle();

  if (existing) {
    const merged = options.merge ? mergeProfileFromIngest(existing, row) : row;
    await db
      .from('user_profiles')
      .update({
        display_name: merged.display_name,
        profile_data: merged.profile_data,
        behavioral_summary: merged.behavioral_summary,
        msg_count: merged.msg_count,
        last_updated: now,
      })
      .eq('id', existing.id)
      .eq('group_id', row.group_id);
    return;
  }

  await db.from('user_profiles').insert({
    ...row,
    last_updated: now,
  });
}

export { mergeProfileFromIngest } from './profile-merge.js';
