import type { CharacterConfig, LanguageMode } from '@wavi/shared';
import { db } from '../db/client.js';
import { synthesizeCharacter } from './summarizer.js';
import { selectVoiceSamples } from './voice-samples.js';

/** Rebuild character_config from summaries, profiles, relationships, and real chat lines. */
export async function synthesizeCharacterForGroup(groupId: string): Promise<CharacterConfig> {
  const { data: groupMeta, error: groupError } = await db.from('groups').select('name, language_mode, character_config').eq('id', groupId).single();

  if (groupError || !groupMeta) {
    throw new Error(groupError?.message ?? 'Group not found');
  }

  const [{ data: episodeRows }, { data: profiles }, { data: relationships }, { data: sampleMsgs }] = await Promise.all([
    db.from('episode_summaries').select('summary').eq('group_id', groupId).order('msg_from', { ascending: true }),
    db.from('user_profiles').select('display_name, behavioral_summary').eq('group_id', groupId),
    db.from('relationship_map').select('narrative, interaction_score').eq('group_id', groupId).order('interaction_score', { ascending: false }).limit(8),
    db.from('messages').select('sender_name, body, is_agent_reply').eq('group_id', groupId).eq('is_agent_reply', false).order('timestamp', { ascending: false }).limit(200),
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
    relationshipNarratives: (relationships ?? []).map((r) => r.narrative).filter(Boolean),
    voiceSamples: selectVoiceSamples(sampleMsgs ?? []),
    languageMode,
    usageContext: { groupId },
  });

  const characterConfig: CharacterConfig = {
    ...character,
    preset: 'custom',
    version: 1,
    last_synthesized_at: new Date().toISOString(),
    ...(prevReplyModel ? { reply_model: prevReplyModel } : {}),
  };

  const { error: updateError } = await db.from('groups').update({ character_config: characterConfig }).eq('id', groupId);
  if (updateError) throw new Error(updateError.message);

  return characterConfig;
}
