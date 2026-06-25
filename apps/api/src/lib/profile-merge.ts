import { mergeAliases } from './identity.js';
import { isPlaceholderProfileSummary } from './profile-fallback.js';
import type { UserProfileData } from '@wavi/shared';

function profileAliases(profileData: UserProfileData | null | undefined): string[] {
  return profileData?.aliases ?? [];
}

export type UserProfileUpsertRow = {
  group_id: string;
  wa_user_id: string;
  display_name: string;
  profile_data: UserProfileData;
  behavioral_summary: string;
  msg_count: number;
};

type ExistingProfile = {
  display_name: string | null;
  behavioral_summary: string | null;
  profile_data: UserProfileData | null;
  msg_count: number | null;
};

/** Merge ingest output into an existing profile, preserving dashboard curation. */
export function mergeProfileFromIngest(existing: ExistingProfile, incoming: UserProfileUpsertRow): UserProfileUpsertRow {
  const existingData = (existing.profile_data ?? {}) as UserProfileData;
  const curation = existingData.curation ?? {};
  const mergedAliases = mergeAliases(profileAliases(existingData), ...profileAliases(incoming.profile_data));

  const existingSummary = existing.behavioral_summary?.trim() ?? '';
  const preserveSummary = curation.summary_locked && existingSummary.length > 0 && !isPlaceholderProfileSummary(existingSummary);

  return {
    ...incoming,
    display_name: curation.display_name_locked ? (existing.display_name ?? incoming.display_name) : incoming.display_name,
    behavioral_summary: preserveSummary ? existing.behavioral_summary! : incoming.behavioral_summary,
    msg_count: Math.max(existing.msg_count ?? 0, incoming.msg_count),
    profile_data: {
      ...incoming.profile_data,
      aliases: mergedAliases,
      curation: {
        ...curation,
        source_aliases: curation.source_aliases,
      },
    },
  };
}
