import { db } from '../db/client.js';
import type { UserProfileData } from '@wavi/shared';

export type UserProfileUpsertRow = {
  group_id: string;
  wa_user_id: string;
  display_name: string;
  profile_data: UserProfileData;
  behavioral_summary: string;
  msg_count: number;
};

/** Insert or update a profile for one group. Never reassigns rows across groups. */
export async function upsertUserProfile(row: UserProfileUpsertRow): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing } = await db.from('user_profiles').select('id').eq('group_id', row.group_id).eq('wa_user_id', row.wa_user_id).maybeSingle();

  if (existing) {
    await db
      .from('user_profiles')
      .update({
        display_name: row.display_name,
        profile_data: row.profile_data,
        behavioral_summary: row.behavioral_summary,
        msg_count: row.msg_count,
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
