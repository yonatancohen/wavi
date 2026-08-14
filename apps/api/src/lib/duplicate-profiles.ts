import { normalizeNameForMatch } from './identity.js';

export type DuplicateProfileCandidate = {
  id: string;
  wa_user_id: string;
  display_name: string;
  msg_count: number | null;
};

/** Live WhatsApp user ids are digits-only phone (or LID) numbers after stripping @domain. */
export function isPhoneLikeWaUserId(waUserId: string): boolean {
  return /^\d{8,}$/.test(waUserId.trim());
}

export function groupProfilesByNormalizedName<T extends DuplicateProfileCandidate>(profiles: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const profile of profiles) {
    const key = normalizeNameForMatch(profile.display_name);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(profile);
    else groups.set(key, [profile]);
  }
  return groups;
}

/**
 * Prefer the live phone-keyed profile; otherwise highest msg_count.
 * Returns null when the cluster is ambiguous (2+ phone ids) unless force is set.
 */
export function pickKeepProfile<T extends DuplicateProfileCandidate>(cluster: T[], options: { force?: boolean } = {}): { keep: T; merge: T[] } | { ambiguous: true; phones: T[] } | null {
  if (cluster.length < 2) return null;

  const phones = cluster.filter((p) => isPhoneLikeWaUserId(p.wa_user_id));
  if (phones.length >= 2 && !options.force) {
    return { ambiguous: true, phones };
  }

  const ranked = [...cluster].sort((a, b) => {
    const aPhone = isPhoneLikeWaUserId(a.wa_user_id) ? 1 : 0;
    const bPhone = isPhoneLikeWaUserId(b.wa_user_id) ? 1 : 0;
    if (aPhone !== bPhone) return bPhone - aPhone;
    return (b.msg_count ?? 0) - (a.msg_count ?? 0);
  });

  const keep = ranked[0]!;
  const merge = ranked.slice(1);
  return { keep, merge };
}
