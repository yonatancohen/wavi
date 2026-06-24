import { db } from '../db/client.js';
import type { CharacterConfig, LanguageMode } from '@wavi/shared';
import { synthesizeCharacter } from './summarizer.js';

/** Rebuild character_config from stored episode summaries + member profiles. */
export async function synthesizeCharacterForGroup(groupId: string): Promise<CharacterConfig> {
  const { data: groupMeta, error: groupError } = await db.from('groups').select('name, language_mode, character_config').eq('id', groupId).single();

  if (groupError || !groupMeta) {
    throw new Error(groupError?.message ?? 'Group not found');
  }

  const [{ data: episodeRows }, { data: profiles }] = await Promise.all([
    db.from('episode_summaries').select('summary').eq('group_id', groupId).order('msg_from', { ascending: true }),
    db.from('user_profiles').select('display_name, behavioral_summary').eq('group_id', groupId),
  ]);

  const episodeSummaries = (episodeRows ?? []).map((r) => r.summary).filter(Boolean);
  if (episodeSummaries.length === 0) {
    throw new Error('No episode summaries — run upload or rebuild first');
  }

  const languageMode = (groupMeta.language_mode ?? 'he') as LanguageMode;
  const prevReplyModel = (groupMeta.character_config as CharacterConfig | null)?.reply_model;

  const character = await synthesizeCharacter({
    groupName: groupMeta.name ?? 'the group',
    episodeSummaries: episodeSummaries.slice(-10),
    userProfiles: (profiles ?? []).map((p) => `${p.display_name}: ${p.behavioral_summary}`),
    languageMode,
    usageContext: { groupId },
  });

  const characterConfig: CharacterConfig = {
    ...character,
    preset: 'custom',
    version: 1,
    ...(prevReplyModel ? { reply_model: prevReplyModel } : {}),
  };

  const { error: updateError } = await db.from('groups').update({ character_config: characterConfig }).eq('id', groupId);
  if (updateError) throw new Error(updateError.message);

  return characterConfig;
}
