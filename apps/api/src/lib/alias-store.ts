import { db } from '../db/client.js';
import { mergeAliases, namesLikelyMatch, normalizeNameForMatch } from './identity.js';
import type { UserProfileData } from '@wavi/shared';

export function getProfileAliases(profileData: UserProfileData | null | undefined): string[] {
  return profileData?.aliases ?? [];
}

/** Append aliases to a profile (deduped). Returns updated alias list. */
export async function addProfileAliases(groupId: string, waUserId: string, ...newAliases: string[]): Promise<string[]> {
  const { data: profile } = await db.from('user_profiles').select('id, profile_data, display_name').eq('group_id', groupId).eq('wa_user_id', waUserId).maybeSingle();

  if (!profile) return [];

  const existing = getProfileAliases(profile.profile_data as UserProfileData);
  const merged = mergeAliases(existing, ...newAliases);
  // Never alias the canonical display name to itself
  const displayNorm = normalizeNameForMatch(profile.display_name ?? '');
  const filtered = merged.filter((a) => normalizeNameForMatch(a) !== displayNorm);

  await db
    .from('user_profiles')
    .update({
      profile_data: { ...(profile.profile_data as object), aliases: filtered },
      last_updated: new Date().toISOString(),
    })
    .eq('id', profile.id)
    .eq('group_id', groupId);

  return filtered;
}

/** Find profile by display name or alias (exact normalized match). */
export async function findProfileByNameOrAlias(groupId: string, name: string) {
  const norm = normalizeNameForMatch(name);
  const { data: profiles } = await db.from('user_profiles').select('*').eq('group_id', groupId);

  for (const p of profiles ?? []) {
    if (normalizeNameForMatch(p.display_name ?? '') === norm) return p;
    const aliases = getProfileAliases(p.profile_data as UserProfileData);
    if (aliases.some((a) => normalizeNameForMatch(a) === norm)) return p;
  }
  return null;
}

/** Fuzzy-find profile for live reconciliation (display name or alias overlap). */
export async function findProfileForReconciliation(groupId: string, pushName: string, waUserId: string) {
  const { data: byAlias } = await db.from('user_profiles').select('*').eq('group_id', groupId).eq('display_name', pushName).maybeSingle();
  if (byAlias && !isWaJid(byAlias.wa_user_id)) return byAlias;

  const { data: profiles } = await db.from('user_profiles').select('*').eq('group_id', groupId);
  for (const p of profiles ?? []) {
    if (p.wa_user_id === waUserId) return null; // already keyed
    if (isWaJid(p.wa_user_id)) continue;
    if (namesLikelyMatch(p.display_name ?? '', pushName)) return p;
    const aliases = getProfileAliases(p.profile_data as UserProfileData);
    if (aliases.some((a) => namesLikelyMatch(a, pushName))) return p;
  }
  return null;
}

function isWaJid(id: string): boolean {
  return id.includes('@');
}
