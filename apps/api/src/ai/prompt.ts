import { db } from '../db/client.js';
import { embed } from '../lib/embeddings.js';
import type { PromptContext, LanguageMode } from '@wavi/shared';
export { buildSystemPrompt, buildConversationTurns } from './prompt-build.js';

// ── Main context assembler ────────────────────────────────────

export async function buildPromptContext(params: { groupId: string; senderWaId: string; currentMessage: string }): Promise<PromptContext> {
  const { groupId, senderWaId, currentMessage } = params;

  // Run structured fetch and vector search in parallel
  const [structured, rag] = await Promise.all([fetchStructuredContext(groupId, senderWaId), fetchRAGContext(groupId, currentMessage)]);

  return {
    ...structured,
    ...rag,
    current_message: currentMessage,
  };
}

// ── Layer 1 + 3: Structured Postgres fetch ────────────────────

async function fetchStructuredContext(groupId: string, senderWaId: string) {
  const [groupResult, profileResult, relationshipsResult, memoriesResult, contextResult, messagesResult] = await Promise.all([
    db.from('groups').select('name, character_config, language_mode').eq('id', groupId).single(),

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
    sender_profile: profileResult.data ?? null,
    relevant_relationships: relationshipsResult.data ?? [],
    group_memories: memoriesResult.data ?? [],
    group_context_summary: contextResult.data?.summary_text ?? '',
    recent_messages: (messagesResult.data ?? []).reverse(),
  };
}

// ── Layer 2: pgvector RAG fetch ───────────────────────────────

async function fetchRAGContext(groupId: string, query: string) {
  const queryEmbedding = await embed(query);

  // Supabase doesn't support raw SQL easily via the JS client for vector search
  // Use rpc() with a stored procedure (defined in schema)
  const [chunksResult, episodesResult] = await Promise.all([
    db.rpc('search_message_chunks', {
      p_group_id: groupId,
      p_embedding: JSON.stringify(queryEmbedding),
      p_limit: 5,
    }),

    db.rpc('search_episode_summaries', {
      p_group_id: groupId,
      p_embedding: JSON.stringify(queryEmbedding),
      p_limit: 3,
    }),
  ]);

  return {
    rag_chunks: (chunksResult.data ?? []).map((r: any) => r.summary ?? r.content),
    rag_episode_summaries: (episodesResult.data ?? []).map((r: any) => r.summary),
  };
}
