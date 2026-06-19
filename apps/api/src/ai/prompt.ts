import { db } from '../db/client.js'
import { embed } from '../lib/embeddings.js'
import type { PromptContext, LanguageMode } from '@wavi/shared'

// ── Main context assembler ────────────────────────────────────

export async function buildPromptContext(params: {
  groupId: string
  senderWaId: string
  currentMessage: string
}): Promise<PromptContext> {
  const { groupId, senderWaId, currentMessage } = params

  // Run structured fetch and vector search in parallel
  const [structured, rag] = await Promise.all([
    fetchStructuredContext(groupId, senderWaId),
    fetchRAGContext(groupId, currentMessage),
  ])

  return {
    ...structured,
    ...rag,
    current_message: currentMessage,
  }
}

// ── Layer 1 + 3: Structured Postgres fetch ────────────────────

async function fetchStructuredContext(groupId: string, senderWaId: string) {
  const [
    groupResult,
    profileResult,
    relationshipsResult,
    memoriesResult,
    contextResult,
    messagesResult,
  ] = await Promise.all([
    db.from('groups')
      .select('name, character_config, language_mode')
      .eq('id', groupId)
      .single(),

    db.from('user_profiles')
      .select('*')
      .eq('group_id', groupId)
      .eq('wa_user_id', senderWaId)
      .single(),

    db.from('relationship_map')
      .select('*')
      .eq('group_id', groupId)
      .or(`user_a_wa_id.eq.${senderWaId},user_b_wa_id.eq.${senderWaId}`)
      .order('interaction_score', { ascending: false })
      .limit(3),

    db.from('group_memories')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),

    db.from('group_contexts')
      .select('summary_text')
      .eq('group_id', groupId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single(),

    db.from('messages')
      .select('id, group_id, sender_wa_id, sender_name, body, is_agent_reply, flagged_miss, timestamp, created_at')
      .eq('group_id', groupId)
      .order('timestamp', { ascending: false })
      .limit(20),
  ])

  return {
    character_config:        groupResult.data?.character_config ?? null,
    group_name:              groupResult.data?.name ?? 'the group',
    language_mode:           (groupResult.data?.language_mode ?? 'auto') as LanguageMode,
    sender_profile:          profileResult.data ?? null,
    relevant_relationships:  relationshipsResult.data ?? [],
    group_memories:          memoriesResult.data ?? [],
    group_context_summary:   contextResult.data?.summary_text ?? '',
    recent_messages:         (messagesResult.data ?? []).reverse(),
  }
}

// ── Layer 2: pgvector RAG fetch ───────────────────────────────

async function fetchRAGContext(groupId: string, query: string) {
  const queryEmbedding = await embed(query)

  // Supabase doesn't support raw SQL easily via the JS client for vector search
  // Use rpc() with a stored procedure (defined in schema)
  const [chunksResult, episodesResult] = await Promise.all([
    db.rpc('search_message_chunks', {
      p_group_id:   groupId,
      p_embedding:  JSON.stringify(queryEmbedding),
      p_limit:      5,
    }),

    db.rpc('search_episode_summaries', {
      p_group_id:   groupId,
      p_embedding:  JSON.stringify(queryEmbedding),
      p_limit:      3,
    }),
  ])

  return {
    rag_chunks:            (chunksResult.data ?? []).map((r: any) => r.summary ?? r.content),
    rag_episode_summaries: (episodesResult.data ?? []).map((r: any) => r.summary),
  }
}

// ── Assemble system prompt from context ───────────────────────

export function buildSystemPrompt(ctx: PromptContext): string {
  const { character_config: c, language_mode } = ctx
  if (!c || !c.sliders || !c.opinions || !c.voice) {
    return `You are ${process.env.WA_AGENT_NAME ?? 'Wavi'}, a helpful and friendly AI assistant. Reply naturally and concisely.`
  }

  const sliders = c.sliders
  const languageInstruction = language_mode === 'auto'
    ? 'Reply in the same language as the message you received.'
    : `Always reply in ${getLanguageName(language_mode)}.`

  return `
BLOCK 1 — IDENTITY
You are ${process.env.WA_AGENT_NAME ?? 'Wavi'}, a member of a WhatsApp group called "${ctx.group_name}".

BLOCK 2 — CHARACTER
${c.voice}
Your opinions: ${c.opinions.join(' | ')}
Signature behavior: ${c.signature_behavior}

BLOCK 3 — PERSONALITY
Formality: ${sliders.formality}/100 (${sliders.formality < 30 ? 'very casual' : sliders.formality > 70 ? 'formal' : 'balanced'})
Humor: ${sliders.humor}/100 (${sliders.humor < 30 ? 'serious' : sliders.humor > 70 ? 'very funny' : 'moderate'})
Verbosity: ${sliders.verbosity}/100 (${sliders.verbosity < 30 ? 'very brief' : sliders.verbosity > 70 ? 'elaborate' : 'moderate'})
Assertiveness: ${sliders.assertiveness}/100 (${sliders.assertiveness < 30 ? 'hedged/neutral' : sliders.assertiveness > 70 ? 'direct/opinionated' : 'balanced'})
Empathy: ${sliders.empathy}/100 (${sliders.empathy < 30 ? 'task-focused' : sliders.empathy > 70 ? 'very warm' : 'balanced'})

BLOCK 4 — GROUP CONTEXT
${ctx.group_context_summary || 'No group context available yet.'}

BLOCK 5 — SENDER PROFILE
${ctx.sender_profile
  ? `The person tagging you is ${ctx.sender_profile.display_name}. ${ctx.sender_profile.behavioral_summary}`
  : 'You do not have a profile for this person yet — treat them neutrally.'}

BLOCK 6 — RELATIONSHIP CONTEXT
${ctx.relevant_relationships.length > 0
  ? ctx.relevant_relationships.map((r) => r.narrative).join(' ')
  : 'No notable relationship patterns for this person yet.'}

BLOCK 7 — RELEVANT HISTORY (retrieved by semantic search)
${ctx.rag_chunks.length > 0
  ? ctx.rag_chunks.map((c, i) => `[Past context ${i + 1}]: ${c}`).join('\n')
  : 'No relevant past context found.'}
${ctx.rag_episode_summaries.length > 0
  ? ctx.rag_episode_summaries.map((s, i) => `[Episode ${i + 1}]: ${s}`).join('\n')
  : ''}

BLOCK 8 — RULES
${languageInstruction}
Stay in character at all times. You are a group member, not a bot.
If someone reacts negatively to something you said, apologize in your own voice — not formally.
Never say "As an AI..." or break the fourth wall unless directly asked if you are an AI.
Keep replies proportional to the question. Short questions get short answers.
`.trim()
}

// ── Build conversation turns (last 20 messages) ───────────────

export function buildConversationTurns(ctx: PromptContext) {
  const turns = ctx.recent_messages.map((msg) => ({
    role: (msg.is_agent_reply ? 'assistant' : 'user') as 'user' | 'assistant',
    content: msg.is_agent_reply
      ? msg.body
      : `${msg.sender_name}: ${msg.body}`,
  }))

  // Claude requires the first message to be from 'user'; drop any leading
  // assistant turns that could appear when the oldest stored message is an
  // agent reply. If there are no user turns at all, return empty so the
  // current message (appended by the worker) is the only turn.
  const firstUser = turns.findIndex((t) => t.role === 'user')
  if (firstUser === -1) return []
  return firstUser > 0 ? turns.slice(firstUser) : turns
}

function getLanguageName(code: LanguageMode): string {
  const map: Record<string, string> = {
    he: 'Hebrew', en: 'English', ar: 'Arabic',
    es: 'Spanish', fr: 'French', ru: 'Russian',
  }
  return map[code] ?? code
}
