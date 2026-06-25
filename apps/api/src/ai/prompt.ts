import { db } from '../db/client.js';
import { embed } from '../lib/embeddings.js';
import { normalizeWebSearchQuery, searchWeb, shouldUseWebSearch } from '../lib/web-search.js';
import type { PromptContext, LanguageMode, MentionedPerson, QuotedMessageContext, UserProfileData } from '@wavi/shared';
export { buildSystemPrompt, buildConversationTurns } from './prompt-build.js';
import { messageReferencesName } from '../lib/identity.js';
import { getProfileAliases } from '../lib/alias-store.js';
import { normalizeRagQuery } from './rag-query.js';

const RAG_SIMILARITY_THRESHOLD = 0.35;

export { normalizeRagQuery } from './rag-query.js';

// ── Main context assembler ────────────────────────────────────

export async function buildPromptContext(params: { groupId: string; senderWaId: string; currentMessage: string; quotedMessage?: QuotedMessageContext | null }): Promise<PromptContext> {
  const { groupId, senderWaId, currentMessage, quotedMessage } = params;

  const structured = await fetchStructuredContext(groupId, senderWaId);
  const ragQuery = normalizeRagQuery(currentMessage, structured.recent_messages);
  const rag = await fetchRAGContext(
    groupId,
    ragQuery,
    structured.recent_messages.map((m) => m.body),
  );

  let web_search = null;
  if (structured.web_search_enabled && shouldUseWebSearch(currentMessage)) {
    web_search = await searchWeb(normalizeWebSearchQuery(currentMessage));
  }

  const resolvedNames = await resolveDisplayNames(groupId, [...structured.recent_messages.map((m) => m.sender_wa_id), senderWaId, ...(quotedMessage ? [quotedMessage.sender_wa_id] : [])]);

  const mentionedPeople = await fetchMentionedPeople(groupId, currentMessage, senderWaId);

  return {
    ...structured,
    ...rag,
    mentioned_people: mentionedPeople,
    resolved_display_names: resolvedNames,
    quoted_message: quotedMessage ?? null,
    current_message: currentMessage,
    web_search,
  };
}

// ── Layer 1 + 3: Structured Postgres fetch ────────────────────

async function fetchStructuredContext(groupId: string, senderWaId: string) {
  const [groupResult, profileResult, relationshipsResult, memoriesResult, contextResult, messagesResult] = await Promise.all([
    db.from('groups').select('name, character_config, language_mode, web_search_enabled, image_generation_enabled').eq('id', groupId).single(),

    db.from('user_profiles').select('*').eq('group_id', groupId).eq('wa_user_id', senderWaId).single(),

    db.from('relationship_map').select('*').eq('group_id', groupId).or(`user_a_wa_id.eq.${senderWaId},user_b_wa_id.eq.${senderWaId}`).order('interaction_score', { ascending: false }).limit(3),

    db.from('group_memories').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),

    db.from('group_contexts').select('summary_text').eq('group_id', groupId).order('generated_at', { ascending: false }).limit(1).single(),

    db
      .from('messages')
      .select('id, group_id, sender_wa_id, sender_name, body, is_agent_reply, flagged_miss, timestamp, created_at')
      .eq('group_id', groupId)
      .order('timestamp', { ascending: false })
      .limit(20),
  ]);

  return {
    character_config: groupResult.data?.character_config ?? null,
    group_name: groupResult.data?.name ?? 'the group',
    language_mode: (groupResult.data?.language_mode ?? 'auto') as LanguageMode,
    web_search_enabled: groupResult.data?.web_search_enabled ?? false,
    image_generation_enabled: groupResult.data?.image_generation_enabled ?? false,
    sender_profile: profileResult.data ?? null,
    relevant_relationships: relationshipsResult.data ?? [],
    group_memories: memoriesResult.data ?? [],
    group_context_summary: contextResult.data?.summary_text ?? '',
    recent_messages: (messagesResult.data ?? []).reverse(),
  };
}

// ── Layer 2: pgvector RAG fetch ───────────────────────────────

async function fetchRAGContext(groupId: string, query: string, recentMessageBodies: string[] = []) {
  const queryEmbedding = await embed(query, { groupId });

  const [chunksResult, episodesResult] = await Promise.all([
    db.rpc('search_message_chunks', {
      p_group_id: groupId,
      p_embedding: JSON.stringify(queryEmbedding),
      p_limit: 10,
    }),

    db.rpc('search_episode_summaries', {
      p_group_id: groupId,
      p_embedding: JSON.stringify(queryEmbedding),
      p_limit: 5,
    }),
  ]);

  // True if the first 80 chars of a RAG result overlap with any recent message already in the prompt.
  const isRecentDup = (text: string) => {
    const head = text.slice(0, 80);
    return recentMessageBodies.some((body) => body.includes(head) || head.includes(body.slice(0, 80)));
  };

  const rag_chunks = ((chunksResult.data ?? []) as { similarity: number; summary?: string; content?: string }[])
    .filter((r) => (r.similarity ?? 0) >= RAG_SIMILARITY_THRESHOLD)
    .filter((r) => !isRecentDup(r.summary ?? r.content ?? ''))
    .slice(0, 5)
    .map((r) => r.summary ?? r.content)
    .filter((s): s is string => s !== undefined);

  const rag_episode_summaries = ((episodesResult.data ?? []) as { similarity: number; summary: string }[])
    .filter((r) => (r.similarity ?? 0) >= RAG_SIMILARITY_THRESHOLD)
    .filter((r) => !isRecentDup(r.summary))
    .slice(0, 3)
    .map((r) => r.summary);

  return { rag_chunks, rag_episode_summaries };
}

/** Map wa_user_id → display_name for conversation turns. */
export async function resolveDisplayNames(groupId: string, waIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(waIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data } = await db.from('user_profiles').select('wa_user_id, display_name').eq('group_id', groupId).in('wa_user_id', unique);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.wa_user_id] = row.display_name;
  }
  return map;
}

/** Detect member names referenced in the message and load their context. */
export async function fetchMentionedPeople(groupId: string, message: string, senderWaId: string): Promise<MentionedPerson[]> {
  const { data: profiles } = await db.from('user_profiles').select('*').eq('group_id', groupId);

  if (!profiles?.length) return [];

  const mentioned = profiles.filter((p) => {
    if (p.wa_user_id === senderWaId) return false;
    const aliases = getProfileAliases(p.profile_data as UserProfileData);
    return messageReferencesName(message, p.display_name ?? '', aliases);
  });

  if (!mentioned.length) return [];

  const results: MentionedPerson[] = [];
  for (const profile of mentioned.slice(0, 3)) {
    const aliases = getProfileAliases(profile.profile_data as UserProfileData);
    const { data: rels } = await db
      .from('relationship_map')
      .select('narrative')
      .eq('group_id', groupId)
      .or(`user_a_wa_id.eq.${profile.wa_user_id},user_b_wa_id.eq.${profile.wa_user_id}`)
      .order('interaction_score', { ascending: false })
      .limit(2);

    results.push({
      display_name: profile.display_name,
      aliases,
      behavioral_summary: profile.behavioral_summary ?? '',
      sensitivity_flags: profile.profile_data?.sensitivity_flags ?? [],
      relationships: (rels ?? []).map((r) => r.narrative),
    });
  }

  return results;
}
